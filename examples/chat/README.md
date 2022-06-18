# Chat

An ephemeral real-time chat service that emulates the experience of an in-person
conversation, online. You can only read the messages you receive while you're in
the chat room. The messages aren't displayed with timestamps and they disappear
from view after 5 minutes.

On the server, chat room identifiers are stored along with the names that have
been claimed in each room. Nothing else is stored in RAM for longer than a
single request. Everything resets when the server restarts.

Clients receive a signed cookie when they sign into a chatroom. The cookie
contains their name in that room.

## Caveats

This service won't work with Deno Deploy because it requires local state on the
server, which won't be synced between each Deploy data center.