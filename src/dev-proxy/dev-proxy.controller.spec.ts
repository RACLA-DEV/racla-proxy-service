import { Test, TestingModule } from '@nestjs/testing';
import { DevProxyController } from './dev-proxy.controller';

describe('DevProxyController', () => {
  let controller: DevProxyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevProxyController],
    }).compile();

    controller = module.get<DevProxyController>(DevProxyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
