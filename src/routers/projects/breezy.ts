import {createRouterLogger, getRedaction} from '@utils/logger';
import {
  // disconnect,
  // fetchProfile,
  // fetchUsers,
  // login,
  // logout,
  signup
  // updateUserStatus
} from '@events/projects/breezy';
import type {Logger} from 'pino';
import type {Server} from 'socket.io';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  let breezyLogger: Logger | null = null;
  getRedaction({module: '@events/projects/breezy'}).then((redaction): void => {
    breezy.on('connection', (socket): void => {
      if (!breezyLogger) {
        breezyLogger = createRouterLogger({
          socket: socket,
          redaction: redaction
        });
      }
      breezyLogger.info('socket connected');
      signup(socket, breezyLogger);
      // login(socket, breezyLogger);
      // fetchUsers(socket, breezyLogger, {namespace: breezy});
      // fetchProfile(socket, breezyLogger);
      // updateUserStatus(socket, breezyLogger);
      // logout(socket, breezyLogger);
      // disconnect(socket, breezyLogger);
    });
  });
};

export default breezyRouter;
