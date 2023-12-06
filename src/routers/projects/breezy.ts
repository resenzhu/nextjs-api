import {
  disconnect,
  fetchProfile,
  fetchUsers,
  login,
  logout,
  signup,
  updateUserStatus,
  verifyStatus,
  verifyToken
} from '@events/projects/breezy';
import {getRedaction, logger} from '@utils/logger';
import type {Server} from 'socket.io';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.use(verifyToken());
  breezy.use(verifyStatus(breezy.sockets));
  getRedaction({module: '@events/projects/breezy'}).then((redaction): void => {
    breezy.on('connection', (socket): void => {
      const breezyLogger = logger.child(
        {
          namespace: 'project/breezy',
          socketid: socket.id
        },
        {redact: {paths: redaction, censor: '[redacted]'}}
      );
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
