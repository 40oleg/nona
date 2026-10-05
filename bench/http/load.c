// HTTP/1.1 load generator: N connections, one outstanding request each, epoll,
// edge-free fast path: the next request is sent right after a response
// completes (no epoll_ctl per request). Usage: load2 PORT CONNS SECONDS [path] [close] [bodybytes]
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/epoll.h>
#include <sys/socket.h>
typedef struct { int fd; long got, need; int header_done, chunked; double start; long sent; char hdr[4096]; int hlen; } conn_t;
static double now(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec+t.tv_nsec/1e9; }
static int port, keepalive=1, epfd; static char req[8192]; static long reqlen, body; static char *bodybuf;
static double *lat; static long nlat, caplat, completed, errors; static int measuring; static char buf[1<<20];
static void record(double v){ if(!measuring)return; completed++; if(nlat==caplat){caplat=caplat?caplat*2:1<<16; lat=realloc(lat,caplat*sizeof(double));} lat[nlat++]=v; }
static void open_conn(conn_t*c){
  c->fd=socket(AF_INET,SOCK_STREAM|SOCK_NONBLOCK,0); int one=1; setsockopt(c->fd,IPPROTO_TCP,TCP_NODELAY,&one,4);
  struct sockaddr_in a={0}; a.sin_family=AF_INET; a.sin_port=htons(port); a.sin_addr.s_addr=htonl(0x7f000001);
  connect(c->fd,(void*)&a,sizeof a);
  struct epoll_event e={.events=EPOLLIN|EPOLLOUT,.data.ptr=c}; epoll_ctl(epfd,EPOLL_CTL_ADD,c->fd,&e);
  c->sent=-1; // not started; first EPOLLOUT starts
}
static int send_req(conn_t*c){ // returns 0 ok (fully sent), 1 would block, -1 error
  if(c->sent<0){ c->sent=0; c->got=0; c->need=-1; c->header_done=0; c->chunked=0; c->hlen=0; c->start=now(); }
  while(c->sent<reqlen+body){
    ssize_t w = c->sent<reqlen ? send(c->fd,req+c->sent,reqlen-c->sent,MSG_NOSIGNAL) : send(c->fd,bodybuf+(c->sent-reqlen),body-(c->sent-reqlen),MSG_NOSIGNAL);
    if(w<0){ if(errno==EAGAIN) return 1; return -1; } c->sent+=w; }
  return 0;
}
static void reopen(conn_t*c){ close(c->fd); open_conn(c); }
static void done_one(conn_t*c){
  record(now()-c->start);
  if(!keepalive){ reopen(c); return; }
  c->sent=-1; int r=send_req(c);
  if(r<0){ errors++; reopen(c); }
}
// feed response bytes; returns 1 when the response completed
static int feed(conn_t*c,char*p,long n){
  while(n>0){
    if(!c->header_done){
      long take=n; if(c->hlen+take>(long)sizeof c->hdr-1) take=sizeof c->hdr-1-c->hlen;
      memcpy(c->hdr+c->hlen,p,take); c->hlen+=take; c->hdr[c->hlen]=0;
      char*e=strstr(c->hdr,"\r\n\r\n"); if(!e){ p+=take; n-=take; continue; }
      long used=(e+4-c->hdr)-(c->hlen-take); c->header_done=1;
      char*cl=strcasestr(c->hdr,"\r\ncontent-length:"); c->need=cl?atol(cl+17):-1;
      c->chunked=(c->need<0&&strcasestr(c->hdr,"chunked"));
      p+=used; n-=used; c->got=0;
      if(c->need==0) return 1;
      continue;
    }
    if(c->chunked){ // naive: look for terminator in data
      c->got+=n; if(n>=5&&memcmp(p+n-5,"0\r\n\r\n",5)==0) return 1; return 0; }
    c->got+=n; n=0;
    if(c->need>=0&&c->got>=c->need) return 1;
  }
  return 0;
}
int main(int argc,char**argv){
  port=atoi(argv[1]); int nc=atoi(argv[2]); double secs=atof(argv[3]); const char*path=argc>4?argv[4]:"/";
  keepalive=!(argc>5&&!strcmp(argv[5],"close")); body=argc>6?atol(argv[6]):0;
  if(body>0) reqlen=snprintf(req,sizeof req,"POST %s HTTP/1.1\r\nHost: localhost\r\nContent-Length: %ld\r\n%s\r\n",path,body,keepalive?"":"Connection: close\r\n");
  else reqlen=snprintf(req,sizeof req,"GET %s HTTP/1.1\r\nHost: localhost\r\n%s\r\n",path,keepalive?"":"Connection: close\r\n");
  bodybuf=calloc(1,body+1); memset(bodybuf,'x',body);
  epfd=epoll_create1(0); conn_t*cs=calloc(nc,sizeof(conn_t)); for(int i=0;i<nc;i++)open_conn(&cs[i]);
  double t0=now(), warm=t0+0.5, end=warm+secs; struct epoll_event ev[512];
  while(1){
    double t=now(); if(!measuring&&t>=warm){measuring=1;} if(t>=end)break;
    int k=epoll_wait(epfd,ev,512,100);
    for(int i=0;i<k;i++){ conn_t*c=ev[i].data.ptr;
      if(ev[i].events&EPOLLOUT){ if(c->sent<0||c->sent<reqlen+body){ int r=send_req(c); if(r<0){errors++;reopen(c);continue;} } }
      if(ev[i].events&(EPOLLIN|EPOLLHUP|EPOLLERR)){
        for(;;){ ssize_t r=recv(c->fd,buf,sizeof buf,0);
          if(r<0){ if(errno!=EAGAIN){errors++;reopen(c);} break; }
          if(r==0){ if(!keepalive&&c->header_done&&(c->need<0||c->got>=c->need)){ record(now()-c->start); reopen(c);} else {errors++; reopen(c);} break; }
          if(feed(c,buf,r)){ if(keepalive) done_one(c); else { c->header_done=2; /* wait close */ } if(!keepalive) { record(now()-c->start); reopen(c); break; } }
        }
      }
    }
  }
  double el=end-warm;
  int cmp(const void*a,const void*b){double x=*(double*)a,y=*(double*)b;return x<y?-1:x>y;}
  qsort(lat,nlat,sizeof(double),cmp);
  printf("req/s %.0f  p50 %.3f ms  p99 %.3f ms  errors %ld\n",completed/el,nlat?lat[nlat/2]*1e3:0,nlat?lat[(long)(nlat*0.99)]*1e3:0,errors);
  return 0;
}
