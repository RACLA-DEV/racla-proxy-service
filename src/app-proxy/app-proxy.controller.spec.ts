import { Test, TestingModule } from '@nestjs/testing';
import { AppProxyController } from './app-proxy.controller';

describe('AppProxyController', () => {
  let controller: AppProxyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppProxyController],
    }).compile();

    controller = module.get<AppProxyController>(AppProxyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
