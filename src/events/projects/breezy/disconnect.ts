import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';

const disconnectEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'disconnect';
  socket.on(event, (): void => {
    database
      .getConnection()
      .then((connection): void => {
        connection
          .execute('CALL SP_BREEZY_GET_ACTIVE_USER_BY_SOCKETID (:socketId)', {
            socketId: socket.id
          })
          .then((userPacket): void => {
            const [userResult] = (
              userPacket[0] as ProcedureCallPacket<RowDataPacket[]>
            )[0];
            if (userResult) {
              connection
                .execute(
                  'CALL SP_BREEZY_UPDATE_USER (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status, :updateLastOnline)',
                  {
                    userId: userResult.userid,
                    userName: userResult.username,
                    displayName: userResult.displayname,
                    password: userResult.password,
                    sessionId: userResult.sessionid,
                    socketId: null,
                    status: 'offline',
                    updateLastOnline: 1
                  }
                )
                .then((): void => {
                  connection
                    .execute(
                      'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)',
                      {userId: userResult.userid}
                    )
                    .then((disconnectedUserPacket): void => {
                      const [disconnectedUserResult] = (
                        disconnectedUserPacket[0] as ProcedureCallPacket<
                          RowDataPacket[]
                        >
                      )[0];
                      if (disconnectedUserResult) {
                        const disconnectedUser: User = {
                          id: disconnectedUserResult.userid,
                          userName: disconnectedUserResult.username,
                          displayName: disconnectedUserResult.displayname,
                          password: disconnectedUserResult.password,
                          joinDate: disconnectedUserResult.createdtime,
                          session: {
                            id: disconnectedUserResult.sessionid,
                            socket: disconnectedUserResult.socketid,
                            status: disconnectedUserResult.status,
                            lastOnline: disconnectedUserResult.lastonline
                          }
                        };
                        const userStatusNotif: UserStatusNotif = {
                          user: {
                            id: disconnectedUser.id,
                            session: {
                              status: disconnectedUser.session.status
                                .replace('appear', '')
                                .trim() as 'online' | 'away' | 'offline',
                              lastOnline: disconnectedUser.session.lastOnline
                            }
                          }
                        };
                        socket.broadcast.emit(
                          'update user status',
                          userStatusNotif
                        );
                      }
                    });
                });
            }
          })
          .then((): void => {
            logger.info('socket disconnected');
          })
          .finally((): void => {
            connection.release();
          });
      })
      .catch((connectionError: NodeJS.ErrnoException): void => {
        logger.warn({error: connectionError.message}, `${event} error`);
      });
  });
};

export default disconnectEvent;
