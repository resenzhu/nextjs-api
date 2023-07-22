import {Socket} from 'socket.io';

const mainRouter = (socket: Socket) => {
  socket.on('test', (): void => console.log('success'));
};

export default mainRouter;
