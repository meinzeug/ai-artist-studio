#define _GNU_SOURCE
#include <linux/landlock.h>
#include <sys/syscall.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdint.h>
// Stable ABI-v4 wire layout, including when built with Debian 12's older headers.
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#ifndef LANDLOCK_ACCESS_NET_BIND_TCP
#define LANDLOCK_ACCESS_NET_BIND_TCP (1ULL << 0)
#define LANDLOCK_ACCESS_NET_CONNECT_TCP (1ULL << 1)
#define LANDLOCK_RULE_NET_PORT 2
#endif
struct studio_ruleset_v4 { uint64_t handled_access_fs; uint64_t handled_access_net; };
struct studio_net_port_v4 { uint64_t allowed_access; uint64_t port; };
// Fail closed. All children inherit filesystem and TCP restrictions.
int main(int argc,char**argv){
 int abi=syscall(__NR_landlock_create_ruleset,NULL,0,LANDLOCK_CREATE_RULESET_VERSION);
 if(abi<4){fprintf(stderr,"Landlock ABI >=4 erforderlich (vorhanden %d).\n",abi);return 77;}
 uint64_t rd=LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR;
 uint64_t all=(1ULL<<15)-1;
 struct studio_ruleset_v4 rules={.handled_access_fs=all,.handled_access_net=LANDLOCK_ACCESS_NET_BIND_TCP|LANDLOCK_ACCESS_NET_CONNECT_TCP};
 int fd=syscall(__NR_landlock_create_ruleset,&rules,sizeof(rules),0);if(fd<0){perror("ruleset");return 77;}
 int i=1;for(;i<argc&&strcmp(argv[i],"--");i+=2){if(i+1>=argc)return 77;int p=open(argv[i+1],O_PATH|O_CLOEXEC);if(p<0){if(errno==ENOENT)continue;perror(argv[i+1]);return 77;}uint64_t mask=!strcmp(argv[i],"--rw")?all:!strcmp(argv[i],"--exec")?rd|LANDLOCK_ACCESS_FS_EXECUTE:rd;struct landlock_path_beneath_attr rule={.allowed_access=mask,.parent_fd=p};if(syscall(__NR_landlock_add_rule,fd,LANDLOCK_RULE_PATH_BENEATH,&rule,0)){/* file: read_dir and create operations not valid */rule.allowed_access=mask&(LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_WRITE_FILE|LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_TRUNCATE);if(syscall(__NR_landlock_add_rule,fd,LANDLOCK_RULE_PATH_BENEATH,&rule,0)){perror("path rule");return 77;}}close(p);}
 struct studio_net_port_v4 net={.allowed_access=LANDLOCK_ACCESS_NET_CONNECT_TCP,.port=443};if(syscall(__NR_landlock_add_rule,fd,LANDLOCK_RULE_NET_PORT,&net,0)){perror("net rule");return 77;}
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)||syscall(__NR_landlock_restrict_self,fd,0)){perror("restrict");return 77;}close(fd);
 struct rlimit cores={0,0};setrlimit(RLIMIT_CORE,&cores);struct rlimit files={256,256};setrlimit(RLIMIT_NOFILE,&files);
 if(i+1>=argc)return 77;
 execvp(argv[i+1],&argv[i+1]);perror("exec");return 77;
}
