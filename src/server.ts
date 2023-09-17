import {type IncomingMessage, createServer} from 'http';
import {Server} from 'socket.io';
import {config} from 'dotenv';
import {logger} from '@utils/logger';
import router from '@routers/index';

if (process.env.NODE_ENV !== 'production') {
  config();
}

const httpServer = createServer();
const ioServer = new Server({
  transports: ['websocket', 'polling'],
  serveClient: false,
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.APP_CLIENT
        : undefined,
    optionsSuccessStatus: 200
  },
  allowRequest: (
    request: IncomingMessage,
    callback: (error: string | null | undefined, success: boolean) => void
  ): void => {
    const validOrigin = request.headers.origin === process.env.APP_CLIENT;
    callback(null, process.env.NODE_ENV === 'production' ? validOrigin : true);
  }
});

router(ioServer);

ioServer.attach(httpServer);
httpServer
  .listen(process.env.APP_PORT, (): void => {
    logger.info(
      {environment: process.env.NODE_ENV, port: process.env.APP_PORT},
      'server started'
    );
  })
  .on('error', (error: Error): void => {
    logger.error(error, 'an error occured while starting the server');
  });
