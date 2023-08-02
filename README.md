Required: [Firehose Aggregator](https://github.com/2547techno/firehose-aggregator) (unless you want to interface with the message queue yourself)

Optional: [Firehose Delegator](https://github.com/2547techno/firehose-delegator)

![diagram](https://github.com/2547techno/firehose-node/assets/109011672/f5a4b51d-86ac-42e6-9ca0-a5ad460805f4)

## Config

`config.json`

```jsonc
{
    "nodeId": "node1foobar", // unique node id
    "twitch": {
        "username": "2547techno", // username used if not using anon connection
        "token": "xxx", // used as password for non-anon connection & token for standalone live list generation
        "cid": "xxx", // client id of token
        "list": {
            "max": 200000 // max (very rough) channels in generated live list
        }
    },
    "amqp": {
        "url": "localhost", // rabbitmq url
        "user": "user", // rabbitmq username
        "password": "password", // rabbitmq password
        "queueNames": {
            "messageQueue": "firehose-message", // queue name to push all messages to
            "delegationQueue": "firehose-delegation" // queue name to receive delegation messages from, if not in standalone list mode
        }
    },
    "rest": {
        "port": 3001 // port REST API is served on
    },
    "connections": {
        "anon": true, // connect to irc as anon or not
        "maxChannels": 500, // max channels per connection
        "queueInterval": 6000, // how long to wait before creating a new connection
        "joinTimeout": 10000, // how long to wait after sending a JOIN to a channel
        "print": {
            "part": false, // log PARTs
            "join": false, // log JOINs
            "banned": false // log suspended channels
        }
    }
}
```

## Env

### `FILE=<filename>`

Pre-load a list of channels to join on startup. Channel names are separated by newlines. Do not have trailing newlines at the nd of the file.

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
