import {IncomingMessage, createServer} from 'http';
import {Server} from 'socket.io';
import {config} from 'dotenv';
import {mainRouter} from '@routers/index';

if (process.env.NODE_ENV !== 'production') {
  config();
}

const httpServer = createServer();
const ioServer = new Server({
  transports: ['websocket', 'polling'],
  serveClient: false,
  cors: {
    origin: process.env.APP_CLIENT,
    optionsSuccessStatus: 200
  },
  allowRequest: (
    request: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void
  ): void => {
    const validOrigin = request.headers.origin === process.env.APP_CLIENT;
    callback(null, validOrigin);
  }
});

mainRouter(ioServer);

ioServer.attach(httpServer);
httpServer.listen(process.env.APP_PORT);
