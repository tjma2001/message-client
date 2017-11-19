class MessageManager {
    constructor() {
        this.messageHandler = []
        this.errorHandler = []
        this.asks = []
    }

    add(type, handler) {
        switch(type) {
            case "error": {
                break;
            }
            case "message": {
                this.messageHandler.push(handler)
            }
            default : {
                throw new Error("message type does not exist")
            }
        }
    }

    receive(message) {
        this.messageHandler.forEach(messageHandler => {
            messageHandler(message)
        })
    }


    receiveSpecific(message) {

    }

    send(agent, message) {

    }

    ask(agent, message) {

    }

    setChannel(channel) {
        this.channel = channel
    }
}

module.exports = MessageManager