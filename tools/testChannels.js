const fs = require('fs');

const file = fs.readFileSync('channels.txt');
const channels = file.toString().split("\n");
console.log(channels);

fetch("http://localhost:3001/channels", {
    method: "POST",
    headers: {
        "content-type": "application/json",
    },
    body: JSON.stringify({
        channels
    })
})