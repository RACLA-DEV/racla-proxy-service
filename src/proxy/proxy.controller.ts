import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { Response } from 'express';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Controller()
export class ProxyController {
  private readonly allowedDomains = [
    'https://v-archive.net',
    'https://hard-archive.com',
  ];

  constructor(private readonly httpService: HttpService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  proxyPostRequest(
    @Query('url') url: string,
    @Body() body: any,
    @Headers() headers: any,
    @Res() res: Response,
  ): void {
    this.handleRequest('POST', url, body, headers, res);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  proxyGetRequest(
    @Query('url') url: string,
    @Headers() headers: any,
    @Res() res: Response,
  ): void {
    this.handleRequest('GET', url, null, headers, res);
  }

  private handleRequest(
    method: 'GET' | 'POST',
    url: string,
    body: any,
    headers: any,
    res: Response,
  ): void {
    if (!url) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing URL parameter' });
      return;
    }

    try {
      // URL 검증
      const parsedUrl = new URL(url);
      if (!this.allowedDomains.includes(parsedUrl.origin)) {
        res
          .status(HttpStatus.FORBIDDEN)
          .json({ error: 'Access to this domain is not allowed' });
        return;
      }

      // 헤더 필터링 및 수정
      const filteredHeaders = {
        ...headers,
        // 민감한 헤더 제거
        host: parsedUrl.hostname, // 타겟 호스트로 동적 설정
        origin: parsedUrl.origin, // 오리진 설정
        referer: `${parsedUrl.origin}/`, // 레퍼러 설정
        // 불필요한 헤더 제거
        'content-length': undefined,
        'accept-encoding': undefined,
      };

      const axiosConfig = {
        headers: filteredHeaders,
        validateStatus: () => true, // 모든 상태 코드를 정상으로 처리
      };

      // 요청 로그 개선
      console.log(
        `[${new Date().toISOString()}] Proxying ${method} to: ${url}`,
      );
      console.debug('Request details:', { headers: filteredHeaders, body });

      const request$ =
        method === 'POST'
          ? this.httpService.post(url, body, axiosConfig)
          : this.httpService.get(url, axiosConfig);

      request$
        .pipe(
          map((response: AxiosResponse) => {
            // 응답 로그 출력
            console.log(`Response status: ${response.status}`);
            console.log(`Response data:`, response.data);

            const responseData = response.data;

            // 클라이언트로 응답 전달
            res.status(response.status).json(responseData);
          }),
          catchError((error) => {
            // 상세한 에러 로깅
            console.error(
              `[${new Date().toISOString()}] Proxy error to ${url}:`,
              {
                error: error.message,
                stack: error.stack,
                code: error.code,
                response: error.response?.data,
              },
            );

            // 에러 응답 처리 개선
            const statusCode =
              error.response?.status || error.code === 'ECONNREFUSED'
                ? HttpStatus.BAD_GATEWAY
                : HttpStatus.INTERNAL_SERVER_ERROR;

            const errorMessage = error.response?.data || {
              error: error.message,
              code: error.code,
              target: parsedUrl.origin,
            };

            const errorResponseData = {
              status: statusCode,
              ...errorMessage,
              debug: {
                proxiedUrl: url,
                allowedDomains: this.allowedDomains,
              },
            };

            res.status(statusCode).json(errorResponseData);
            return of();
          }),
        )
        .subscribe(); // Observable의 구독을 시작합니다.
    } catch (error) {
      // 잘못된 URL 형식 처리
      console.error('Invalid URL format error:', error);
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid URL format' });
    }
  }
}
