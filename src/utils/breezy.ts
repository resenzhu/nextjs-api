import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import {verify} from 'jsonwebtoken';

export type JwtPayload = {
  id: string;
  session: string;
  iat: number;
  iss: string;
  sub: string;
};

export const verifyJwt = (socket: Socket): Promise<JwtPayload | Error> =>
  new Promise<JwtPayload | Error>((resolve, reject): void => {
    try {
      const decoded = verify(
        socket.handshake.auth.token ?? '',
        Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString()
      );
      const jwtPayload = decoded as JwtPayload;
      database
        .getConnection()
        .then((connection): void => {
          connection
            .execute('CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)', {
              userId: jwtPayload.id
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
                      socketId: socket.id,
                      status: userResult.status,
                      updateLastOnline: 1
                    }
                  )
                  .then((): void => {
                    connection
                      .execute(
                        'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)',
                        {userId: userResult.userid}
                      )
                      .then((connectedUserPacket): void => {
                        const [connectedUserResult] = (
                          connectedUserPacket[0] as ProcedureCallPacket<
                            RowDataPacket[]
                          >
                        )[0];
                        if (connectedUserResult) {
                          const connectedUser: User = {
                            id: connectedUserResult.userid,
                            userName: connectedUserResult.username,
                            displayName: connectedUserResult.displayname,
                            password: connectedUserResult.password,
                            joinDate: connectedUserResult.createdtime,
                            session: {
                              id: connectedUserResult.sessionid,
                              socket: connectedUserResult.socketid,
                              status: connectedUserResult.status,
                              lastOnline: connectedUserResult.lastonline
                            }
                          };
                          const userStatusNotif: UserStatusNotif = {
                            user: {
                              id: connectedUser.id,
                              session: {
                                status: connectedUser.session.status
                                  .replace('appear', '')
                                  .trim() as 'online' | 'away' | 'offline',
                                lastOnline: connectedUser.session.lastOnline
                              }
                            }
                          };
                          socket.broadcast.emit(
                            'update user status',
                            userStatusNotif
                          );
                          resolve(jwtPayload);
                        } else {
                          reject(
                            new Error('500|connected user was not found.')
                          );
                        }
                      });
                  });
              } else {
                reject(new Error('404|current user was not found.'));
              }
            })
            .finally((): void => {
              connection.release();
            });
        })
        .catch((connectionError: NodeJS.ErrnoException): void => {
          reject(
            new Error(
              `500|an error occured while connecting to database.|${connectionError.message}`
            )
          );
        });
    } catch (jwtError) {
      reject(new Error(`401|token is missing or invalid.|${jwtError}`));
    }
  });
