const amqp = require("amqplib/callback_api")
    , Async = require("async")
    , Msgpack = require("msgpack")
    , uniqid = require("uniqid")
    , host = process.env.RABBIT_HOST
    , context = (process.env.CONTEXT || "local")

class Client {
    constructor(agentName) {
        this.queuedEvents = []
        this.queuedRequests = []
        this.askRequests = []
        this.agentName = agentName
        this.context = context

        if(!host) {
            throw new Error("You need to set the RABBIT_HOST variable to your rabbitmq server")
            process.exit(2)
        }

        amqp.connect(host, (error, conn) => {
            error && (function() { console.error(error); process.exit(1)} )()

            conn.createChannel((error, channel) => {
                this.channel = channel
                channel.assertQueue("", { durable: true, exclusive: true }, (error, queue) => {
                    this.queue = queue
                    
                    channel.prefetch(1)
                    channel.assertQueue(this.getAgentContext())

                    this.replayQueuedRequests()
                    this.replayQueuedEvents()
                    this.setConsumer(this.queue.queue, null)
                })
            })
        })

        this._monitorWaitingRequests()
    }

    getAgentContext(agent) {
        agent = agent || this.agentName
        return `${ this.context }.${ agent }`
    }

    ask(agent, message, options, replayId) {
        let requestId = replayId || uniqid()
        if(!(this.queue && this.channel)) {
            this.queuedRequests.push({
                type: "ask",
                agent: agent,
                message: message,
                options, options,
                replayId: requestId
            })
        } else {
            this.tell(agent, message, {...options, correlationId: requestId, replyTo: this.queue.queue })
        }
        
        if(!replayId) {
            return new Promise((resolve, reject) => {
                this.askRequests.push({
                    askId: requestId,
                    agent: agent,
                    resolve: resolve,
                    reject: reject,
                    timestamp: new Date()
                })

                this.askRequests.sort(function(requestA, requestB) {
                    return requestA.timestamp - requestB.timestamp
                })
            })
        }
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
        if(!(this.queue && this.channel)) {
            this.queuedRequests.push({
                type: "tell",
                agent: agent,
                message: message,
                options: options
            })
        } else {
            if(!agent.includes("amq.gen")) {
                agent = this.getAgentContext(agent)
            }

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
                let handlers = [this.getAgentContext()]

                Async.each(handlers, this.setConsumer.bind(this, callback), error => {
                    if(error) {
                        throw new Error("could not create bindings", error)
                        process.exit(2)
                    }
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
            this[request.type](request.agent, request.message, request.options, request.replayId)
        }
    }

    reply(content, message) {
        this.tell(message.properties.replyTo, content, {
            correlationId: message.properties.correlationId
        })
    }

    setConsumer() {
        let callback = arguments[0], handler = arguments[1], done = arguments[2]
        if(arguments.length == 2) {
            handler = arguments[0]
            done = arguments[1]
        }

        this.channel.consume(handler, message => {
            let unpackedMessage = Msgpack.unpack(message.content)
            if(!this.handleAsk(unpackedMessage, message)) {
                callback(unpackedMessage, message)
            }
            this.channel.ack(message)
        }, {noAck: false}, function(err, ok) {
            done && done(err)
        })
    }
}

module.exports = Client