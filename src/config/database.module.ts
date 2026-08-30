import { Global, Module } from '@nestjs/common';
import mysql from 'mysql2/promise';
import { requireEnv, optionalEnv } from './env.js';

export const DB_POOL = 'DB_POOL';

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: () =>
        mysql.createPool({
          host: optionalEnv('DB_HOST', '127.0.0.1'),
          port: Number(optionalEnv('DB_PORT', '3306')),
          user: requireEnv('DB_USER'),
          password: optionalEnv('DB_PASSWORD', ''),
          database: requireEnv('DB_NAME'),
          waitForConnections: true,
          connectionLimit: 10,
          decimalNumbers: true,
        }),
    },
  ],
  exports: [DB_POOL],
})
export class DatabaseModule {}
