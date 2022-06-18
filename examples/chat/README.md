# Chat

An ephemeral real-time chat service. Messages aren't stored in a database, you
can only read the messages you receive while you're in the chatroom.

On the server, chat room identifiers are stored, as well ephemeral cookie
sessions for each user. Users can claim one name in any chat room. Chat rooms
reset when the server restarts.

## Caveats

This service won't work with Deno Deploy because it requires ephemeral state on
the server, which won't be synced between each data center that Deploy operates.