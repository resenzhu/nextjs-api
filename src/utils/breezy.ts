import type {User, UserStatusNotif} from '@events/projects/breezy';
import {DateTime} from 'luxon';
import type {RowDataPacket} from 'mysql2/promise';
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
            .execute(
              `SELECT DISTINCT userid, username, displayname, password, sessionid, socketid, status, lastonline, createdtime FROM breezy_users
               WHERE userid = :userId AND sessionid = :sessionId AND TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) <= 14
               LIMIT 1`,
              {
                userId: jwtPayload.id,
                sessionId: jwtPayload.session,
                currentDate: DateTime.utc().toISODate()
              }
            )
            .then((packet): void => {
              const [userResult] = packet[0] as RowDataPacket[];
              if (userResult) {
                const existingUser: User = {
                  id: userResult.userid,
                  userName: userResult.username,
                  displayName: userResult.displayname,
                  password: userResult.password,
                  joinDate: userResult.createdtime,
                  session: {
                    id: userResult.sessionid,
                    socket: userResult.socketid,
                    status: userResult.status,
                    lastOnline: userResult.lastonline
                  }
                };
                const updatedUser: User = {
                  ...existingUser,
                  session: {
                    ...existingUser.session,
                    socket: socket.id,
                    lastOnline: DateTime.utc().toISO()
                  }
                };
                connection
                  .execute(
                    `UPDATE breezy_users
                     SET socketid = :socketId, lastonline = :lastOnline, updatedtime = :updatedTime
                     WHERE userid = :userId`,
                    {
                      socketId: updatedUser.session.socket,
                      lastOnline: DateTime.fromISO(
                        updatedUser.session.lastOnline
                      ).toFormat('yyyy-MM-dd HH:mm:ss'),
                      updatedTime: DateTime.utc().toFormat(
                        'yyyy-MM-dd HH:mm:ss'
                      ),
                      userId: existingUser.id
                    }
                  )
                  .then((): void => {
                    const userStatusNotif: UserStatusNotif = {
                      user: {
                        id: existingUser.id,
                        session: {
                          status: updatedUser.session.status
                            .replace('appear', '')
                            .trim() as 'online' | 'away' | 'offline',
                          lastOnline: updatedUser.session.lastOnline
                        }
                      }
                    };
                    socket.broadcast.emit(
                      'update user status',
                      userStatusNotif
                    );
                    resolve(jwtPayload);
                  });
              } else {
                reject(new Error('404|user was not found.'));
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
