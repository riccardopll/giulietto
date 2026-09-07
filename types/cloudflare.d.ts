/** Runtime contracts used by this Worker. */
interface D1Result<T=unknown> { results:T[]; success:boolean; meta:{changes:number; duration:number; last_row_id:number; changed_db:boolean; size_after:number; rows_read:number; rows_written:number}; }
interface D1PreparedStatement { bind(...values:unknown[]):D1PreparedStatement; first<T=unknown>(column?:string):Promise<T|null>; all<T=unknown>():Promise<D1Result<T>>; run<T=unknown>():Promise<D1Result<T>>; raw<T=unknown[]>(options?:{columnNames?:boolean}):Promise<T[]>; }
interface D1Database { prepare(sql:string):D1PreparedStatement; batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>; exec(sql:string):Promise<{count:number;duration:number}>; dump():Promise<ArrayBuffer>; }
interface Fetcher { fetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>; }
declare module 'cloudflare:workers' { export const env:{DB:D1Database}; }
