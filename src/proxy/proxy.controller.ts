import { Controller, Post, Get, Body, Query, Res, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Response } from 'express';
import { catchError, map } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { AxiosResponse } from 'axios';

@Controller()
export class ProxyController {
  private readonly allowedDomains = ['https://v-archive.net'];

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

  private handleRequest(method: 'GET' | 'POST', url: string, body: any, headers: any, res: Response): void {
    if (!url) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing URL parameter' });
      return;
    }

    try {
      // URL 검증
      const parsedUrl = new URL(url);
      if (!this.allowedDomains.includes(parsedUrl.origin)) {
        res.status(HttpStatus.FORBIDDEN).json({ error: 'Access to this domain is not allowed' });
        return;
      }

      // 클라이언트에서 받은 헤더를 프록시 요청에 포함시킵니다.
      const axiosConfig = {
        headers: {
          ...headers, // 기존 헤더들을 복사
          'Host': 'v-archive.net', // 호스트 헤더를 타겟 URL에 맞게 설정
          'Content-Type': headers['content-type'] || 'application/json', // Content-Type 설정
        },
      };

      // 요청 로그 출력
      console.log(`Proxy ${method} request to: ${url}`);
      console.log(`Request body:`, body);
      console.log(`Request headers:`, headers);

      const request$ = method === 'POST'
        ? this.httpService.post(url, body, axiosConfig)
        : this.httpService.get(url, axiosConfig);

      request$.pipe(
        map((response: AxiosResponse) => {
          // 응답 로그 출력
          console.log(`Response status: ${response.status}`);
          console.log(`Response data:`, response.data);

          // 클라이언트에게 반환할 데이터
          /* const responseData = {
            status: response.status,
            data: response.data.data,
            url, // 원래 요청한 URL
            headers, // 요청한 헤더
            body, // 요청한 본문
          }; */

	  const responseData = response.data; 

          // 클라이언트로 응답 전달
          res.status(response.status).json(responseData);
        }),
        catchError(error => {
          // 에러 로그 출력
          console.error('Proxy request error:', error);

          // 에러 응답 처리
          const statusCode = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage = error.response?.data || { error: 'Proxy error' };

          // 클라이언트에게 반환할 데이터
          const errorResponseData = {
            status: statusCode,
            error: errorMessage,
            url, // 원래 요청한 URL
            headers, // 요청한 헤더
            body, // 요청한 본문
          };

          res.status(statusCode).json(errorResponseData);
          return of(); // of()는 필요하지 않지만, 파이프라인에서 오류를 처리하기 위한 자리를 제공
        }),
      ).subscribe(); // Observable의 구독을 시작합니다.

    } catch (error) {
      // 잘못된 URL 형식 처리
      console.error('Invalid URL format error:', error);
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid URL format' });
    }
  }
}

