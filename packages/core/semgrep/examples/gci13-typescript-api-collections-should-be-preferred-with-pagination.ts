// == Non compliant Code Example

// ruleid: gci13-typescript-api-collections-should-be-preferred-with-pagination
import { Controller, Get } from '@nestjs/common';

@Controller()
class TestNonCompliant {
  @Get()
  public find(): Promise<string[]> { return Promise.resolve([]); }
}

// ruleid: gci13-typescript-api-collections-should-be-preferred-with-pagination
@Controller()
class AnotherTestNonCompliant {
  @Get('/users')
  public getUsers(): string[] { return []; }
}

// == Compliant Solution

// ok: gci13-typescript-api-collections-should-be-preferred-with-pagination
interface Pagination {
  items: string[];
  currentPage: number;
  totalPages: number;
}

@Controller()
class TestCompliant {
  @Get()
  public find(): Promise<Pagination> { return Promise.resolve({ items: [], currentPage: 1, totalPages: 1 }); }
}
