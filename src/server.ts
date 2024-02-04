import {Server} from 'socket.io';
import {config} from 'dotenv';
import {createServer} from 'http';
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
  allowRequest: (request, callback): void => {
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
  .on('error', (serverError: Error): void => {
    logger.error(
      {error: serverError.message},
      'an error occured while starting the server'
    );
  });
