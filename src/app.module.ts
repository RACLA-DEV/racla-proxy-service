import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DevProxyController } from './dev-proxy/dev-proxy.controller';
import { AppProxyController } from './app-proxy/app-proxy.controller';

@Module({
  imports: [HttpModule],
  controllers: [AppController, DevProxyController, AppProxyController],
  providers: [AppService],
})
export class AppModule {}
