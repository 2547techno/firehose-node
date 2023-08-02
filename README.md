Required: [Firehose Aggregator](https://github.com/2547techno/firehose-aggregator) (unless you want to interface with the message queue yourself)

Optional: [Firehose Delegator](https://github.com/2547techno/firehose-delegator)

![diagram](https://github.com/2547techno/firehose-node/assets/109011672/f5a4b51d-86ac-42e6-9ca0-a5ad460805f4)

## Config

`config.json`

```jsonc
{
    "nodeId": "node1foobar", // unique node id
    "twitch": {
        // (optional)
        "username": "2547techno", // (optional) username used to connect to irc if token is defined, if undefined anon connection is used
        "token": "xxx" // (optional) used in password for connection, if undefined anon connection is used
    },
    "amqp": {
        "url": "localhost", // rabbitmq url
        "user": "user", // rabbitmq username
        "password": "password", // rabbitmq password
        "queueName": {
            "message": "firehose-message", // queue name to push all messages to
            "delegation": "firehose-delegation" // queue name to receive delegation messages from
        }
    },
    "rest": {
        "port": 3001 // port REST API is served on
    },
    "connection": {
        "maxChannels": 500, // max channels per connection
        "queueInterval": 6000, // how long to wait before creating a new connection
        "joinTimeout": 10000 // how long to wait for a JOIN acknowledgement from a channel
    },
    "print": {
        // log options (optional)
        "part": true, // log PARTs
        "join": true, // log JOINs
        "banned": true // log suspended channels
    }
}
```

## Env

### `FILE=<filename>`

Pre-load a list of channels to join on startup. Channel names are separated by newlines. Do not have trailing newlines at the end of the file.

```text
channel1
channel2
channel3
channel4
```

## REST API

### `PUT /channels`

`application/json` body:

```json
{
    "channels": [
        "channel1",
        "channel2"
        ...
    ]
}
```

Join a list of channels. Will skip channels already joined

### `DELETE /channels`

`application/json` body:

```json
{
    "channels": [
        "channel1",
        "channel2"
        ...
    ]
}
```

Part a list of channels. Will skip channels not joined
