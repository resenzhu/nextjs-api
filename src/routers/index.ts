import type {Server} from 'socket.io';
import mainRouter from '@routers/main';
import projectRouter from '@routers/projects';

const router = (server: Server): void => {
  mainRouter(server);
  projectRouter(server);
};

export default router;
