import type {Server} from 'socket.io';
import breezyRouter from '@routers/projects/breezy';

const projectRouter = (server: Server): void => {
  breezyRouter(server);
};

export default projectRouter;
