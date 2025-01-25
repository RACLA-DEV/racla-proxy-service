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
    try {
      const targetUrl = body?.url || url;

      if (!targetUrl) {
        res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing URL parameter' });
        return;
      }

      // URL 디코딩 및 정규화
      const decodedUrl = decodeURIComponent(targetUrl).trim();
      const parsedUrl = new URL(decodedUrl);

      // hard-archive.com 도메인 처리
      if (parsedUrl.hostname.includes('hard-archive.com')) {
        parsedUrl.pathname = parsedUrl.pathname
          .replace(/\/+/g, '/')
          .replace(/\/+$/, '');
      }

      // queryString이 있는 경우 처리 (GET 요청으로 변환)
      if (body?.queryString) {
        parsedUrl.search = '';
        const newParams = new URLSearchParams(body.queryString);
        parsedUrl.search = newParams.toString();

        // body에서 url과 queryString 제거
        const { url: _, queryString: __, ...restBody } = body;
        body = restBody;

        // queryString이 있는 경우는 무조건 GET 요청으로 처리
        method = 'GET';
      }

      const finalUrl = parsedUrl.href;

      console.log('URL Processing:', {
        method,
        url: finalUrl,
        body: body,
      });

      // URL 검증
      const baseUrl = parsedUrl.origin;
      if (!this.allowedDomains.includes(baseUrl)) {
        res.status(HttpStatus.FORBIDDEN).json({
          error: 'Access to this domain is not allowed',
          allowedDomains: this.allowedDomains,
          requestedDomain: baseUrl,
        });
        return;
      }

      const filteredHeaders = {
        ...headers,
        host: parsedUrl.hostname,
        origin: parsedUrl.origin,
        referer: `${parsedUrl.origin}/`,
        'content-length': undefined,
        'accept-encoding': undefined,
      };

      const axiosConfig = {
        headers: filteredHeaders,
        validateStatus: () => true,
      };

      // 요청 로그 개선
      console.log(
        `[${new Date().toISOString()}] Proxying ${method} to: ${finalUrl}`,
      );
      console.debug('Request details:', { headers: filteredHeaders, body });

      // queryString이 있으면 무조건 GET 요청으로 처리
      const request$ =
        method === 'GET' || body?.queryString
          ? this.httpService.get(finalUrl, axiosConfig)
          : this.httpService.post(finalUrl, body, axiosConfig);

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
              `[${new Date().toISOString()}] Proxy error to ${finalUrl}:`,
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
                proxiedUrl: finalUrl,
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
