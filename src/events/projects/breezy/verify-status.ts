import type {DefaultEventsMap} from 'socket.io/dist/typed-events';
import type {ExtendedError} from 'socket.io/dist/namespace';
import type {Socket} from 'socket.io';
import {logger} from '@utils/logger';

const verifyStatusMiddleware =
  (
    sockets: Map<
      string,
      Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
    >
  ): ((
    socket: Socket,
    next: (error?: ExtendedError | undefined) => void
  ) => void) =>
  (socket, next): void => {
    const breezyLogger = logger.child({
      namespace: 'project/breezy',
      socketid: socket.id
    });
  };

export default verifyStatusMiddleware;
