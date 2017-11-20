# message-client

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
    console.log(response)
}).catch(error => {
    console.error(error)
})
```

As you can see, two interfaces are provided. Tell and Ask. Tell is for fire and forget requests. Ask is when you wish to communicate with a service and want a reply back. Ask returns a promise.