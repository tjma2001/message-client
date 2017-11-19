const amqp = require("amqplib/callback_api"),
    Msgpack = require("msgpack"),
    MessageManager = require("./messageManager"),
    uniqid = require("uniqid"),
    host = process.env.RABBIT_HOST

class Client {
    constructor(agentName) {
        this.messageManager = new MessageManager()
        this.queuedEvents = []
        this.queuedRequests = []
        this.askRequests = []
        this.agentName = agentName

        if(!host) {
            throw new Error("You need to set the RABBIT_HOST variable to your rabbitmq server")
            process.exit(2)
        }

        amqp.connect(host, (error, conn) => {
            error && (function() { console.error(error); process.exit(1)} )()

            conn.createChannel((error, channel) => {
                channel.assertQueue("", { durable: true, exclusive: true }, (error, queue) => {
                    this.queue = queue
                    channel.assertQueue(agentName)
                    channel.prefetch(1)
                    
                    this.channel = channel
                    this.replayQueuedEvents()
                    this.replayQueuedRequests()
                })
                
            })
        })

        this._monitorWaitingRequests()
    }

    ask(agent, message, options, callback) {
        let requestId = uniqid()
        if(!this.queue || !this.channel) {
            this.queuedRequests.push({
                type: "ask",
                agent: agent,
                message: message,
                options, options
            })
        } else {
            this.tell(agent, message, {...options, correlationId: requestId, replyTo: this.queue.queue })
        }
        
        return new Promise((resolve, reject) => {
            this.askRequests.push({
                askId: requestId,
                callback: callback,
                resolve: resolve,
                reject: reject,
                timestamp: new Date()
            })
        })

        this.askRequests.sort(function(requestA, requestB) {
            return requestA.timestamp - requestB.timestamp
        })
    }

    handleAsk(content, message) {
        let ask = this.askRequests.filter(ask => ask.askId == message.properties.correlationId)[0]
        if(ask) {
            let index = this.askRequests.indexOf(ask)
            this.askRequests.splice(index, 1)
            ask.resolve({ message, content })
            return true
        }
        return false
    }
    
    tell(agent, message, options) {
        if(!this.channel) {
            this.queuedEvents.push({
                type: "tell",
                agent: agent,
                message: message,
                options: options
            })
        } else {
            this.channel.sendToQueue(
                agent, 
                Msgpack.pack(message), 
                { 
                    ...options, 
                    persisitent: true, 
                    replyTo: this.queue.queue
                })
        }
        
    }

    _monitorWaitingRequests() {
        setInterval(() => {
            if(this.askRequests.length === 0) { return true }

            let currentDate = new Date()
            let index = this.askRequests.length - 1
            if(this.askRequests[index].timestamp < currentDate.setSeconds(currentDate.getSeconds() - 30)) {
               this.askRequests[index].reject("Timeout Expired") 
            }
        }, 100)
    }

    on() {
        let event  =  arguments[0]
        let callback = arguments[1]

        if(!this.channel) {
            this.queuedEvents.push({ event: event, callback: callback})
        }
        else {
            if(event == "message") {
                console.log("setting message handler")
                this.channel.consume(this.agentName, message => {
                    console.log("consuming message", message.properties.correlationId)
                    let unpackedMessage = Msgpack.unpack(message.content)
                    console.log("pending requests", this.askRequests.length)
                    if(!this.handleAsk(unpackedMessage, message)) {
                        callback(unpackedMessage, message)
                    }
                    this.channel.ack(message)
                }, {noAck: false})
                
                this.channel.consume(this.queue.queue, message => {
                    // console.log("consuming message", message.correlationId)
                    let unpackedMessage = Msgpack.unpack(message.content)
                    console.log("pending requests", this.askRequests.length)
                    if(!this.handleAsk(unpackedMessage, message)) {
                        callback(unpackedMessage, message)
                    }
                    this.channel.ack(message)
                })
            }
        }
    }

    replayQueuedEvents() {
        while(this.queuedEvents.length > 0) {
            let event = this.queuedEvents.shift()
            this.on(event.event, event.callback)
        }
    }

    replayQueuedRequests() {
        while(this.queuedRequests.length > 0) {
            let request = this.queuedRequests.shift()
            this[request.type](request.event, request.message, request.options)
        }
    }

    reply(content, message) {
        console.log("replying to ", content)
        this.tell(message.properties.replyTo, content, {
            correlationId: message.properties.correlationId
        })
        //this.channel.ack(message)
    }
}

module.exports = Client