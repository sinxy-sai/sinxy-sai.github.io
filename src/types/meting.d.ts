declare module "@meting/core" {
  export default class Meting {
    constructor(server: string);
    site(server: string): this;
    cookie(cookie: string): this;
    format(enable: boolean): this;
    search(keyword: string, options?: Record<string, unknown>): Promise<string>;
    song(id: string): Promise<string>;
    album(id: string): Promise<string>;
    artist(id: string, limit?: number): Promise<string>;
    playlist(id: string): Promise<string>;
    url(id: string, bitrate?: number): Promise<string>;
    lyric(id: string): Promise<string>;
    pic(id: string, size?: number): Promise<string>;
  }
}
