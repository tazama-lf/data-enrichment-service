import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TazamaAuthGuard } from './tazama-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [TazamaAuthGuard],
  exports: [TazamaAuthGuard],
})
export class AuthModule {}
