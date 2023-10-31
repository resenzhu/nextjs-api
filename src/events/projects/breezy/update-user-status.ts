import type {Socket} from 'socket.io';

const updateUserStatusEvent = (socket: Socket): void => {
  socket.on('update user status', (): void => {});
};

export default updateUserStatusEvent;
