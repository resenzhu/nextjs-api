import {createRouterLogger, getRedaction} from '@utils/logger';
import {
  disconnect,
  fetchProfile,
  fetchUsers,
  login,
  logout,
  signup,
  updateUserStatus,
  verifyToken
} from '@events/projects/breezy';
import type {Server} from 'socket.io';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.use(verifyToken());
  getRedaction({module: '@events/projects/breezy'}).then((redaction): void => {
    breezy.on('connection', (socket): void => {
      const breezyLogger = createRouterLogger({
        socket: socket,
        redaction: redaction
      });
      breezyLogger.info('socket connected');
      signup(socket, breezyLogger);
      login(socket, breezyLogger);
      fetchUsers(socket, breezyLogger);
      fetchProfile(socket, breezyLogger);
      updateUserStatus(socket, breezyLogger);
      logout(socket, breezyLogger);
      disconnect(socket, breezyLogger);
    });
  });
};

export default breezyRouter;
