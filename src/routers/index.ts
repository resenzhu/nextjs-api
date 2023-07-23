import {Server} from 'socket.io';
import mainRouter from '@routers/main';

const router = (server: Server): void => {
  mainRouter(server);
};

export default router;
