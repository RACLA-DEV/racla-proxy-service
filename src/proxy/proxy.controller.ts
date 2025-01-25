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
      // URL 디코딩
      const decodedUrl = decodeURIComponent(url);
      const parsedUrl = new URL(decodedUrl);

      // POST 요청이고 queryString이 있는 경우에만 URL 수정
      if (method === 'POST' && body?.queryString) {
        // 기존 쿼리 파라미터 유지하면서 새로운 쿼리 추가
        const searchParams = new URLSearchParams(parsedUrl.search);
        const newParams = new URLSearchParams(body.queryString);

        newParams.forEach((value, key) => {
          searchParams.set(key, value);
        });

        // URL 재구성
        parsedUrl.search = searchParams.toString();

        // body에서 queryString 제거
        const { queryString: _, ...restBody } = body;
        body = restBody;

        console.log('URL modified with queryString from body:', parsedUrl.href);
      } else {
        // 기존 방식: URL을 그대로 사용
        console.log('Using original URL:', parsedUrl.href);
      }

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

      const targetUrl = parsedUrl.href;

      // 요청 로그 개선
      console.log(
        `[${new Date().toISOString()}] Proxying ${method} to: ${targetUrl}`,
      );
      console.debug('Request details:', { headers: filteredHeaders, body });

      const request$ =
        method === 'POST'
          ? this.httpService.post(targetUrl, body, axiosConfig)
          : this.httpService.get(targetUrl, axiosConfig);

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
              `[${new Date().toISOString()}] Proxy error to ${targetUrl}:`,
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
                proxiedUrl: targetUrl,
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
