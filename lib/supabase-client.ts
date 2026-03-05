type SupabaseError = {
  message: string;
  code?: string;
};

type SupabaseResponse<T> = {
  data: T | null;
  error: SupabaseError | null;
};

class SupabaseQueryBuilder<TRecord> {
  private filters: Array<{ column: string; value: string }> = [];
  private sortColumn: string | null = null;
  private sortAscending = true;
  private rowLimit: number | null = null;

  constructor(
    private readonly table: string,
    private readonly columns: string,
    private readonly request: <TPayload>(
      table: string,
      method: "GET" | "POST" | "PATCH",
      query: URLSearchParams,
      body?: unknown,
    ) => Promise<SupabaseResponse<TPayload>>,
  ) {}

  eq(column: string, value: string) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sortColumn = column;
    this.sortAscending = options?.ascending ?? true;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async maybeMany() {
    const query = new URLSearchParams();
    query.set("select", this.columns);
    this.filters.forEach((filter) => query.set(filter.column, `eq.${filter.value}`));
    if (this.sortColumn) {
      query.set("order", `${this.sortColumn}.${this.sortAscending ? "asc" : "desc"}`);
    }
    if (this.rowLimit) {
      query.set("limit", `${this.rowLimit}`);
    }

    return this.request<TRecord[]>(this.table, "GET", query);
  }

  async single() {
    const response = await this.limit(1).maybeMany();
    if (response.error) {
      return { data: null, error: response.error } satisfies SupabaseResponse<TRecord>;
    }
    if (!response.data || response.data.length === 0) {
      return {
        data: null,
        error: { message: "No record found.", code: "PGRST116" },
      } satisfies SupabaseResponse<TRecord>;
    }

    return { data: response.data[0], error: null } satisfies SupabaseResponse<TRecord>;
  }
}

class SupabaseClient {
  private readonly url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  private readonly key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  private async request<TPayload>(
    table: string,
    method: "GET" | "POST" | "PATCH",
    query: URLSearchParams,
    body?: unknown,
  ): Promise<SupabaseResponse<TPayload>> {
    if (!this.url || !this.key) {
      return {
        data: null,
        error: { message: "Missing Supabase environment variables.", code: "ENV_MISSING" },
      };
    }

    const resource = new URL(`${this.url}/rest/v1/${table}`);
    resource.search = query.toString();

    try {
      const response = await fetch(resource.toString(), {
        method,
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...((method === "POST" || method == "PATCH") ? { Prefer: "return=representation" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          (payload && typeof payload.message === "string" && payload.message) ||
          (payload && typeof payload.error === "string" && payload.error) ||
          `Supabase request failed (${response.status}).`;

        return {
          data: null,
          error: {
            message,
            code: payload && typeof payload.code === "string" ? payload.code : `${response.status}`,
          },
        };
      }

      return { data: payload as TPayload, error: null };
    } catch {
      return {
        data: null,
        error: { message: "Network error while contacting Supabase.", code: "NETWORK_ERROR" },
      };
    }
  }

  from<TRecord>(table: string) {
    return {
      select: (columns: string) => new SupabaseQueryBuilder<TRecord>(table, columns, this.request.bind(this)),
      insert: async (records: Partial<TRecord> | Array<Partial<TRecord>>) => {
        const query = new URLSearchParams();
        query.set("select", "*");
        return this.request<TRecord[]>(table, "POST", query, records);
      },
      update: (record: Partial<TRecord>) => ({
        eq: async (column: string, value: string) => {
          const query = new URLSearchParams();
          query.set("select", "*");
          query.set(column, `eq.${value}`);
          return this.request<TRecord[]>(table, "PATCH", query, record);
        },
      }),
    };
  }
}

let browserClient: SupabaseClient | null = null;

export function createClientComponentClient() {
  if (!browserClient) {
    browserClient = new SupabaseClient();
  }

  return browserClient;
}

export type { SupabaseResponse };
