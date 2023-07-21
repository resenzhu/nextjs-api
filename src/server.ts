import {Server} from 'socket.io';
import {config} from 'dotenv';
import {createServer} from 'http';

if (process.env.NODE_ENV !== 'production') {
  config();
}

const httpServer = createServer();
const ioServer = new Server();

ioServer.attach(httpServer);
httpServer.listen(process.env.PORT);
