import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TazamaAuthGuard } from './tazam-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [TazamaAuthGuard],
  exports: [TazamaAuthGuard],
})
export class AuthModule {}
