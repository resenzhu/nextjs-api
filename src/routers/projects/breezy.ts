import {
  disconnect,
  fetchUsers,
  login,
  online,
  signup
} from '@events/projects/breezy';
import type {Server} from 'socket.io';
import logger from '@utils/logger';
import {redact as loginRedact} from '@events/projects/breezy/login';
import {redact as onlineRedact} from '@events/projects/breezy/online';
import {redact as signupRedact} from '@events/projects/breezy/signup';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.use(
    online(
      logger.child(
        {namespace: 'project/breezy'},
        {redact: {paths: [...onlineRedact], censor: '[redacted]'}}
      )
    )
  );
  breezy.on('connection', (socket): void => {
    const breezyLogger = logger.child(
      {
        namespace: 'project/breezy',
        socketid: socket.id
      },
      {redact: {paths: [...signupRedact, ...loginRedact], censor: '[redacted]'}}
    );
    breezyLogger.info('socket connected');
    signup(socket, breezyLogger);
    login(socket, breezyLogger);
    fetchUsers(socket, breezyLogger);
    disconnect(socket, breezyLogger);
  });
};

export default breezyRouter;
