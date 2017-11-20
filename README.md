# message-client

Install this package with NPM

    npm install message-client

This is a lightweight message client to be used when communicating with micro-services. The library is easy to use. 

You before you start make sure you have your RABBIT_HOST environment variable set. This should be in the following format:

    ampq://[username[:password:]@]host[:port]

## Usage

The library is very simple to use. Take a look at this code example:

```javscript

const MessageClient = require("message-client")
    , client = new MessageClient("api")

client.tell("notifications", { user: "userid", message: "this is the sample message" })

client.ask("notifications", { type: "request", message: "test message"}).then( response => {
    console.log(response.content)
}).catch(error => {
    console.error(error)
})

client.on("message", function(content, message) {
    console.log("I got a message", content)
    switch(content.type) {
        case "request" : {
            client.reply("sending a string back", message)
            break
        }
        case "superrequest": {
            client.reply({ message: "sending back an object"}, message)
            break
        }
        default : {
            throw new Error ("An unexpected message type was requested")
        }
    }
})
```

As you can see, three interfaces are provided. *tell*, *ask*, *on* and *reply*. Tell is for fire and forget requests. Ask is when you wish to communicate with a service and want a reply back. Ask returns a promise.

On for now only allows you to listen for messages. Errors will be added soon. You can also reply to messages. You must include the original message when replying, otherwise it will not know what message it is replying to.

## Notes

* Don't worry about message compression. All messages are compressed with MessagePack. 
* Be careful of long running or slow Ask calls. For now the library will timeout after 30 seconds and reject the promise. Make sure you handle all rejected promises.
* Do not reply to a message more than once.