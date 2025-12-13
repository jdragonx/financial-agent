import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse, ApiResponseOptions } from '@nestjs/swagger';
import { getReasonPhrase } from 'http-status-codes';

/**
 * Custom decorator to apply multiple ApiResponse decorators
 * based on an array of status codes with optional descriptions and types.
 *
 * @param responses - Array of objects with status codes, descriptions, and types.
 */
export function ApiResponses(responses: ApiResponseOptions[]) {
  const decorators = responses.map(
    ({ description, status, ...otherOptions }) => {
      return ApiResponse({
        status: status,
        description: description ?? (status ? getReasonPhrase(status) : ''),
        ...otherOptions,
      });
    },
  );

  return applyDecorators(...decorators);
}

