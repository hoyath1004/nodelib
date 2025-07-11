#!/bin/bash

# Make sure only root can run our script
if (( $EUID != 0 )); then
    echo "This script must be run as root"
    echo $EUID
    exit
fi

echo "1) insert kernel tunning: /etc/sysctl.conf"
TMP=`grep "Kernel Tunning" /etc/sysctl.conf`
if [ "$TMP" = "" ]; 
then
echo "# Controls IP packet forwarding
net.ipv4.ip_forward = 0

# Controls source route verification
net.ipv4.conf.default.rp_filter = 1

# Do not accept source routing
net.ipv4.conf.default.accept_source_route = 0

# Controls the System Request debugging functionality of the kernel
kernel.sysrq = 0

# Controls whether core dumps will append the PID to the core filename.
# Useful for debugging multi-threaded applications.
kernel.core_uses_pid = 1

# Controls the use of TCP syncookies
net.ipv4.tcp_syncookies = 1

# Controls the default maxmimum size of a mesage queue
kernel.msgmnb = 65536

# Controls the maximum size of a message, in bytes
kernel.msgmax = 65536

# Controls the maximum shared segment size, in bytes
kernel.shmmax = 68719476736

# Controls the maximum number of shared memory segments, in pages
kernel.shmall = 4294967296

#######################
### Kernel Tunning ####
#######################
net.core.netdev_max_backlog=30000
net.core.somaxconn=8096
net.ipv4.tcp_tw_reuse=1
net.ipv4.ip_local_port_range=4000 65535
net.ipv4.tcp_timestamps=1
net.ipv4.tcp_fin_timeout=20
net.ipv4.tcp_max_tw_buckets=1800000
net.ipv4.tcp_max_syn_backlog=8096
vm.overcommit_memory=1
vm.swappiness=1

net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 10
net.ipv4.tcp_rfc1337 = 1

### Syn Flooding Attack ###
net.ipv4.tcp_sack = 0
net.ipv4.tcp_window_scaling = 0
net.ipv4.tcp_rmem = 10240 25165824 25165824
net.ipv4.tcp_wmem = 4096 65536 25165824
net.core.rmem_default = 25165824
net.core.rmem_max = 25165824
net.core.wmem_default = 65536
net.core.wmem_max = 25165824" >> /etc/sysctl.conf
else
	echo "Aleary Insert Kerne Tunning ...."
fi

echo "" 
echo "2) write sysconfig: sysctl -w ...."
read -p "Continue enter...."

TMP=`cat /proc/sys/vm/swappiness`

if [ "$TMP" != "1" ];
then
sysctl -w net.core.netdev_max_backlog="30000"
sysctl -w net.core.somaxconn="8096"
sysctl -w net.ipv4.tcp_max_syn_backlog="8096"
sysctl -w net.ipv4.tcp_max_tw_buckets="1800000"
sysctl -w net.ipv4.tcp_timestamps="1"
sysctl -w net.ipv4.tcp_tw_reuse="1"
sysctl -w net.ipv4.ip_local_port_range="4000 65535"
sysctl -w net.ipv4.tcp_fin_timeout=20
sysctl -w vm.overcommit_memory=1
sysctl -w vm.swappiness=1

#process 별 가용 FD 설정
sysctl -w net.core.somaxconn="21920"
sysctl -w net.ipv4.tcp_max_syn_backlog="20000"
sysctl -w net.ipv4.tcp_max_tw_buckets="1800000"
sysctl -w net.core.netdev_max_backlog="30000"

#TIME_WAIT 줄이는 방법
sysctl -w net.ipv4.tcp_timestamps="1"
sysctl -w net.ipv4.tcp_tw_reuse="1"

#TCP 소켓 가용 Range 변경
sysctl -w net.ipv4.ip_local_port_range="4000 65535"
sysctl vm.overcommit_memory=1

#소켓 버퍼 설정
sysctl -w net.core.rmem_default="253952"
sysctl -w net.core.wmem_default="253952"
sysctl -w net.ipv4.tcp_rmem="253952 253952 16777216"
sysctl -w net.ipv4.tcp_wmem="253952 253952 16777216"
else
echo "Already Setting Sysctl..."
fi

echo ""
echo "3) insert limit conf...."
read -p "Continue enter...."

TEMP=`grep unlimited /etc/security/limits.conf`
if [ "$TEMP" = "" ];
then
echo "* hard nofile 94000
* soft nofile 94000
* hard nproc unlimited
* soft nproc unlimited
* hard core unlimited
* soft core unlimited
mezzo hard nproc 8192
mezzo soft nproc 8192" >> /etc/security/limits.conf
cat /etc/security/limits.conf
else
echo "Already Insert Limit Conf"
fi

echo ""
echo "4) vsftp install...."
read -p "Continue enter...."

TEMP=`yum list installed | grep vsftp`
if [ "$TEMP" = "" ];
then
	read -p "Are you install sFTP y/n? " yn
	if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
	then
		yum -y install vsftpd
		echo "install vsftp..."
		#setsebool -P ftp_home_dir=1
		echo "ftp_username=mman" >> /etc/vsftpd/vsftpd.conf
		echo "add user....."
		adduser mman
		echo "input password...."
		passwd mman 
		service vsftpd start 
		echo "start vsftpd"
	else
		echo "Already Install vsftp...$TEMP"
	fi
fi

echo ""
echo "5) install git..."
read -p "Continue enter...."

TEMP=`yum list installed | grep git.x86_64`
if [ "$TEMP" = "" ];
then
	rpm -Uvh http://opensource.wandisco.com/centos/7/git/x86_64/wandisco-git-release-7-2.noarch.rpm
	yum --enablerepo=WANdisco-git --disablerepo=base,updates install git
else
	echo "Already Install git....$TEMP"
fi

echo ""
echo "6) install nodejs..."
read -p "Continue enter...."

TEMP=`yum list installed | grep nodejs.x86_64`
if [ "$TEMP" = "" ];
then
	curl -sL https://rpm.nodesource.com/setup_16.x | sudo -E bash -
	yum -y install -y nodejs
	yum -y install gcc-c++ make
	npm install pm2 -g
else
	echo "Already Install nodejs....$TEMP"
fi

echo ""
echo "7) make log folder.."
read -p "Continue enter...."

if ! [ -d /usr/local/midas_apache2 ];
then
	echo "make apache foler..."
	mkdir /usr/local/midas_apache2
	mkdir /usr/local/midas_apache2/log
	echo "make /usr/local/midas_apache2"
fi
chown -R mezzo:mezzo /usr/local/midas_apache2

if ! [ -d /log ];
then
	echo "make /log"
	mkdir /log
fi
chown -R mezzo:mezzo /log

if ! [ -d /home/mezzo/daemon ];
then
	echo "make /home/mezzo/daemon"
	mkdir /home/mezzo/daemon
	mkdir /home/mezzo/daemon/node
	mkdir /home/mezzo/daemon/daemon
fi
chown -R mezzo:mezzo /home/mezzo/daemon

echo ""
echo "8) root Cront tab....."
read -p "Continue enter...."

TEMP=`grep logzip.pl /var/spool/cron/root`

if [ "$TEMP" = "" ] || [ ! -f /var/spool/cron/root ];
then
	PS3='Select Daemon: '
	options=("man" "dsp" "ssp" "ncpi" "audience" "quit")
	select opt in "${options[@]}"
	do
	case $opt in
		"man")
echo "select man...."
echo "# 시간 동기화
10 09 * * *  /usr/bin/rdate -s time.bora.net
10 15 * * *  /usr/bin/rdate -s time.bora.net
10 23 * * *  /usr/bin/rdate -s time.bora.net

# 아파치 로그 압축
01 * * * * perl /usr/local/midas_apache/logs/logzip.pl

# DMP 로그 파일 압축
01 * * * * perl /usr/local/midas_apache/logs/r_logzip.pl

00 * * * * perl /usr/local/midas_apache/logs/aud_logzip.pl
00 * * * * perl /usr/local/midas_apache/logs/sid_logzip.pl

01 * * * * perl /usr/local/apache_proxy/logs/logzip.pl
02 * * * * /usr/bin/find /usr/local/apache_proxy/logs -type f -mtime +0 | grep tar.gz | xargs rm -rf 2>&1 > /dev/null

#기간 uv(S-Plus)
# 캠페인
5 * * * * perl /usr/local/midas_uv_logs/log_analysis.pl -t current -s remote
#사업자
5 * * * * perl /usr/local/midas_uv_section_logs/log_analysis_section.pl -t current -s remote" >> /var/spool/cron/root
		break;
		;;
		"dsp")
echo "# 시간 동기화
10 09 * * *  /usr/bin/rdate -s time.bora.net
10 15 * * *  /usr/bin/rdate -s time.bora.net
10 23 * * *  /usr/bin/rdate -s time.bora.net

# 아파치 로그 압축
01 * * * * perl /usr/local/midas_apache/logs/logzip.pl
01 * * * * perl /usr/local/midas_apache/logs/r_logzip.pl
01 * * * * perl /usr/local/apache_proxy/logs/logzip.pl
02 * * * * /usr/bin/find /usr/local/apache_proxy/logs -type f -mtime +0 | grep tar.gz | xargs rm -rf 2>&1 > /dev/null" >> /var/spool/cron/root
		break;
		;;
		"ssp")
echo "30 23 * * * /usr/bin/rdate -s time.bora.net && /sbin/clock -w

#01 * * * * perl /usr/local/midas_apache/logs/logzip.pl
#00 * * * * perl /usr/local/midas_apache/logs/r_logzip.pl
#00 * * * * perl /usr/local/midas_apache/logs/c_logzip.pl

01 * * * * perl /usr/local/apache_proxy/logs/logzip.pl
02 * * * * /usr/bin/find /usr/local/apache_proxy/logs -type f -mtime +0 | grep tar.gz | xargs rm -rf 2>&1 > /dev/null

#외부플랫폼 요청/딜리버리 분석
#10 * * * * /usr/local/bin/perl /usr/local/ssp_req_logs/log_analysis.pl -t current -s remote


#메모리 drop
17 03 * * * sync && echo 3 > /proc/sys/vm/drop_caches
17 15 * * * sync && echo 3 > /proc/sys/vm/drop_caches" >> /var/spool/cron/root
		break;
		;;
		"audience")
echo "# 시간 동기화
10 09 * * *  /usr/bin/rdate -s time.bora.net
10 15 * * *  /usr/bin/rdate -s time.bora.net
10 23 * * *  /usr/bin/rdate -s time.bora.net
30 04 * * * /bin/echo 3 > /proc/sys/vm/drop_caches
01 * * * * /usr/bin/perl /usr/local/audience_apache2/logs/logzip.pl " >> /var/spool/cron/root
		break;
		;;
		"quit")
		TEMP=`grep rdate /var/spool/cron/root`
		if [ "$TEMP" = "" ];
		then
echo "# 시간 동기화
10 09 * * *  /usr/bin/rdate -s time.bora.net
10 15 * * *  /usr/bin/rdate -s time.bora.net
10 23 * * *  /usr/bin/rdate -s time.bora.net" >> /var/spool/cron/root
		fi
		break;
		;;
	esac
done
else
	echo "Already setting root crontab....."
	#cat /var/spool/cron/root
fi

echo ""
echo "8) mezzo Cront tab....."
read -p "Continue enter...."

TEMP=`grep xargs /var/spool/cron/mezzo`

if [ "$TEMP" = "" ] || [ ! -f /var/spool/cron/mezzo ];
then
PS3='Select Daemon: '
options=("man" "dsp" "ssp" "ncpi" "audience" "none")
select opt in "${options[@]}"
do
	case $opt in
		"man")
echo "select man..."
echo "2 0 * * * /usr/bin/find /log -type f -atime +0 | grep -v '\.gz$' | xargs gzip 2>&1 > /dev/null
5 0 * * * /usr/bin/find /log -type f -atime +3 -exec rm -f {} \;
1 0 * * * /bin/sh /home/mezzo/daemon/trc_log.sh

#man log compress
01 * * * * /bin/sh /home/mezzo/daemon/man_comp.sh access_log
02 * * * * /bin/sh /home/mezzo/daemon/man_comp.sh dmp_man_log" >> /var/spool/cron/mezzo
		break;
		;;
		"dsp")
		echo "select dsp..."
echo "25 0 * * * /usr/bin/find /log -type f -atime +0 | grep -v '\.gz$' | xargs gzip 2>&1 > /dev/null
35 0 * * * /usr/bin/find /log -type f -mtime +3 -exec rm -f {} \;
20 0 * * * /bin/sh /home/mezzo/daemon/trc_log.sh

#dsp log compress
01 * * * * /bin/sh /home/mezzo/daemon/dsp_comp.sh v2_dmp_dsp_log
01 * * * * /bin/sh /home/mezzo/daemon/dsp_comp.sh v2_access_log
02 * * * * /bin/sh /home/mezzo/daemon/dsp_comp.sh access_log 1
02 * * * * /bin/sh /home/mezzo/daemon/dsp_comp.sh dmp_dsp_log
01 * * * * /bin/sh /home/mezzo/daemon/dsp_analy.sh" >> /var/spool/cron/mezzo
		break;
		;;
		"ssp")
echo "0 5 * * * /usr/bin/find /log -type f -atime +0 | grep -v '\.gz$' | xargs gzip 2>&1 > /dev/null
0 10 * * * /usr/bin/find /log -type f -mtime +0 | grep -v logs | xargs rm -rf 2>&1 > /dev/null
0 15 * * * /usr/bin/find /log -type f -mtime +5 -exec rm -f {} \;
5 1 * * * /bin/sh /home/mezzo/daemon/trc_log.sh

# ssp log compress
01 * * * * /bin/sh /home/mezzo/daemon/ssp_comp.sh access_log
01 * * * * /bin/sh /home/mezzo/daemon/ssp_comp.sh dmp_ssp_log
01 * * * * /bin/sh /home/mezzo/daemon/ssp_comp.sh ssp_cookie_log
05 * * * * /bin/sh /home/mezzo/daemon/ssp_analy.sh" >> /var/spool/cron/mezzo
		echo "select ssp..."
		break;
		;;
		"ncpi")
		echo "select ncpi..."
		break;
		;;
		"audience")
		echo "select audience..."
echo "0 5 * * * /usr/bin/find /log -type f -atime +0 | grep -v '\.gz$' | xargs gzip 2>&1 > /dev/null
0 10 * * * /usr/bin/find /log -type f -mtime +3 | grep -v logs | xargs rm -rf 2>&1 > /dev/null
0 15 * * * /usr/bin/find /log -type f -mtime +10 -exec rm -f {} \;" >> /var/spool/cron/mezzo
		break;
		;;
		"none")
echo "30 0 * * * /usr/bin/find /log -type f -atime +0 | grep -v '\.gz$' | xargs gzip 2>&1 > /dev/null
40 0 * * * /usr/bin/find /log -type f -mtime +1 -exec rm -f {} \;" >> /var/spool/cron/mezzo

		break;
		;;
	esac
done
fi
cat /var/spool/cron/mezzo


TZ=`timedatectl | grep Time | awk '{print $3}'`
if [ "$TZ" != "Asia/Seoul" ];
then
	echo "8-1) Change TimeZone....: $TZ"
	timedatectl set-timezone Asia/Seoul
	timedatectl
fi

UTC=`date | awk '{print $$5}'`
if [ "$UTC" != "KST" ];
then
	echo "8-2) Change UTC Date....: $UTC"
	ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
	date
fi


echo ""
echo "9) install mezzo node daemon...."
read -p "Continue enter...."

cd /home/mezzo/daemon/node
sudo -u mezzo git config --global credential.helper store

PS3='Select Daemon: '
options=("man" "dsp" "ssp" "exchange" "ncpi" "adr" "audience" "abuse" "parser" "wgw" "man_apache" "dsp_apache" "ssp_apache" "apache_proxy" "man_proxy_conf" "dsp_proxy_conf" "ssp_proxy_conf" "audience_apache" "dsp_audience_apache" "quit/non")
select opt in "${options[@]}"
do
	case $opt in
		"man"|"dsp"|"ssp"|"exchange"|"ncpi"|"adr"|"audience"|"abuse"|"parser")
		echo "select $opt...."
		cd /home/mezzo/daemon/node
		echo "$pwd"

		if [ ! -d /home/mezzo/daemon/node/$opt ];
		then
			if [ "$opt" = "abuse" ];
			then
				sudo -u mezzo git clone http://gitlab.mezzomedia.co.kr/mobile-platform/daemon/abuse_detect.git $opt
			elif [ "$opt" = "parser" ];
			then
				sudo -u mezzo git clone http://gitlab.mezzomedia.co.kr/mobile-platform/batch/log_parser.git $opt
			else 
				sudo -u mezzo git clone http://gitlab.mezzomedia.co.kr/mobile-platform/daemon/$opt.git $opt
			fi

			cd $opt
			sudo -u mezzo git clone http://gitlab.mezzomedia.co.kr/mobile-platform/library/nodejs.git lib
			cd lib
			sudo -u mezzo npm update
			cd ..
			sudo -u mezzo npm update
			cd ..
			
			TEMP=`grep WGWDAEMON /etc/hosts`
			if [ "$TEMP" = "" ];
			then
echo "# localhost
127.0.0.1 GATEWAY_DAEMON
127.0.0.1 WGWDAEMON" >> /etc/hosts
			fi
		else
			pwd
			echo "!!! Already Install Daemon: $opt.... !!!"
			ls -al /home/mezzo/daemon/node/$opt
		fi

		if [ "$opt" = "man" ] || [ "$opt" = "dsp" ] || [ "$opt" = "ssp" ];
		then
			sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/trc_log.sh /home/mezzo/daemon
			echo "Copy.... /home/mezzo/daemon/"$opt"_comp.sh"
			sudo -u mezzo scp -P 7722 mezzo@14.34.11.165:/home/mezzo/daemon/"$opt"_comp.sh /home/mezzo/daemon
			echo "Copy.... /home/mezzo/daemon/"$opt"_stat"
			sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/"$opt"_stat /home/mezzo/daemon
			if [ "$opt" = "man" ];
			then
				sudo -u mezzo cp -r /home/mezzo/daemon/man_stat/* /home/mezzo/daemon
			elif [ "$opt" = "dsp" ];
			then
				sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/get_ipv4.sh /home/mezzo/daemon/
				sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/dsp_analy.sh /home/mezzo/daemon/
				
			elif [ "$opt" = "ssp" ];
			then
				sudo -u mezzo cp -r /home/mezzo/daemon/ssp_stat/* /home/mezzo/daemon
				sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/ssp_analy.sh /home/mezzo/daemon/
				
			fi	
		fi
		;;
		"wgw")
		sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/daemon/daemon/wgw /home/mezzo/daemon/daemon
		;;
		"man_apache")
		yum remove apr.x86_64
		if [ ! -d /home/mezzo/install_module2 ];
		then
			echo "get 192.168.11.25:install_module2 ...."
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/home/mezzo/install_module2 /home/mezzo/
		fi
		if [ ! -d /home/mezzo/source2 ];
		then
			echo "get 192.168.11.25:source2 ...."
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/home/mezzo/source2 /home/mezzo/
		fi

		mkdir /home/mezzo/install_module2/log_perl
		chown -R mezzo:mezzo /home/mezzo/install_module2
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/usr/local/midas_apache/conf /home/mezzo/install_module2/
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/usr/local/midas2/conf /home/mezzo/install_module2/midas_conf
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/usr/local/midas_apache/htdocs /home/mezzo/install_module2/
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/usr/local/midas_apache/logs/*.pl /home/mezzo/install_module2/log_perl

		if [ ! -e /usr/bin/perl ];
		then
			read -p "Are you install Perl y/n? " yn
			if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
			then
				cd /home/mezzo/install_module2/perl-5.18.1
				make clean
				./Configure
				make
				make install
				cp -rf /usr/local/bin/perl /usr/bin/perl
			fi		
		fi

		read -p "Are you install cpan y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			cpan DBI
			cpan Time:ParseDate
			cpan MongoDB
			cpan DBD::mysql
			cpan JSON
		fi
		
		read -p "Are you install HTTP Apache y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			read -p "Continue enter. make&install midas_moudle..."
			cd /home/mezzo/install_module2/apr-1.5.2
			make clean
			./configure 
			make 
			make install
	
			cd /home/mezzo/install_module2/apr-util-1.5.4
			make clean
			./configure --with-apr=/usr/local/apr
			make
			make install
	
			cd /home/mezzo/install_module2/httpd-2.4.18
			make clean
			./configure --prefix=/usr/local/midas_apache --enable-shared=max --enable-ssl --enable-module=ssl --enable-shared=sl --enable-module=so --enable-rule=SHARED_CORE --enable-module=setenvif --with-mpm=event
			make 
			make install

			cd /home/mezzo/install_module2
			wget http://www.mirrorservice.org/sites/distfiles.macports.org/cronolog/cronolog-1.6.2.tar.gz
			tar xvfz cronolog-1.6.2.tar.gz
			cd cronolog-1.6.2/
			./configure --prefix=/usr/local
			make 
			make install

			mkdir /usr/local/midas_apache/logs
			cp -r /home/mezzo/install_module2/conf /usr/local/midas_apache/
			cp -r /home/mezzo/install_module2/htdocs /usr/local/midas_apache/
			cp -r /home/mezzo/install_module2/log_perl/* /usr/local/midas_apache/logs
		else
			echo "Already.....Install Http..."
		fi

		#ls -al /usr/local/midas_apache/conf/ssl
		read -p "Continue enter....install MAN client/server "
		
		
		if [ ! -e /usr/local/midas_apache/modules/mod_midas.so ];
		then
			read -p "Are you install midas Client/Server y/n? " yn
			if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
			then
				if [ ! -d /usr/local/midas2 ];
				then
					mkdir /usr/local/midas2
				fi
				if [ ! -d /usr/local/midas2/bin ];
				then
					mkdir /usr/local/midas2/bin
				fi
				if [ ! -d /usr/local/midas2/conf ];
				then 
					mkdir /usr/local/midas2/conf
					cp -r /home/mezzo/install_module2/midas_conf/* /usr/local/midas2/conf/ 
				fi

				# make client
				cd /home/mezzo/source2/Client
				make
				make install

				# make mod_apache
				cd /home/mezzo/source2/mod_apache2.4
				sed -i 's/\$ \/usr\//#\$ \/usr\//' Makefile
				make
				make install
				sed -i 's/#\$ \/usr\//\$ \/usr\//' Makefile
				echo "...........intall ending"
			fi
		fi
		;;
		"dsp_apache")
		yum remove apr.x86_64
		if [ ! -d /home/mezzo/install_module_thirdparty ];
		then
			echo "get 192.168.11.165:install_module_thirdparty ...."
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/home/mezzo/install_module_thirdparty /home/mezzo/
		fi
		if [ ! -d /home/mezzo/Source_dsp ];
		then
			echo "get 192.168.11.165:Souce_dsp ...."
			mkdir /home/mezzo/Source_dsp
			chown -R mezzo:mezzo /home/mezzo/Source_dsp
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/home/mezzo/Source_dsp/Client /home/mezzo/Source_dsp
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/home/mezzo/Source_dsp/Engine /home/mezzo/Source_dsp
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/home/mezzo/Source_dsp/mod_apache /home/mezzo/Source_dsp
		fi

		mkdir /home/mezzo/install_module_thirdparty/log_perl
		mkdir /home/mezzo/install_module_thirdparty/midas_conf
		chown -R mezzo:mezzo /home/mezzo/install_module_thirdparty

		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/usr/local/midas_apache/conf /home/mezzo/install_module_thirdparty/
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/usr/local/midas2/conf /home/mezzo/install_module_thirdparty/midas_conf
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/usr/local/midas_apache/htdocs /home/mezzo/install_module_thirdparty/
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.165:/usr/local/midas_apache/logs/*.pl /home/mezzo/install_module_thirdparty/log_perl/

		if [ ! -e /usr/bin/perl ];
		then
			read -p "Are you install Perl y/n? " yn
			if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
			then
				cd /home/mezzo/install_module_thirdparty/perl-5.18.1
				make clean
				./Configure
				make
				make install
				cp -rf /usr/local/bin/perl /usr/bin/perl
			fi		
		fi

		read -p "Are you install cpan y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			cpan DBI
			cpan Time:ParseDate
			cpan JSON
		fi
		
		read -p "Are you install HTTP Apache y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			read -p "Continue enter. make&install midas_moudle..."
			cd /home/mezzo/install_module_thirdparty/apr-1.5.2
			make clean
			./configure 
			make 
			make install
	
			echo "make apr..........................."
			cd /home/mezzo/install_module_thirdparty/apr-util-1.5.4
			make clean
			./configure --with-apr=/usr/local/apr
			make
			make install
	
			echo "make httpd..........................."
			cd /home/mezzo/install_module_thirdparty/httpd-2.4.18
			make clean
			./configure --prefix=/usr/local/midas_apache --enable-shared=max --enable-ssl --enable-module=ssl --enable-shared=sl --enable-module=so --enable-rule=SHARED_CORE --enable-module=setenvif --with-mpm=event
			make 
			make install

			echo "make cronlog....................."
			rm -rf /home/mezzo/install_module_thirdparty/cronolog-1.6.2
			cd /home/mezzo/install_module_thirdparty/
			wget http://www.mirrorservice.org/sites/distfiles.macports.org/cronolog/cronolog-1.6.2.tar.gz
			tar xvfz cronolog-1.6.2.tar.gz
			cd cronolog-1.6.2
			./configure --prefix=/usr/local
			make 
			make install

			cp -r /home/mezzo/install_module_thirdparty/conf /usr/local/midas_apache/
			sed -i 's/^CoreDumpDirectory/#CoreDumpDirectory/' /usr/local/midas_apache/conf/httpd.conf			
			cp -r /home/mezzo/install_module_thirdparty/ssl /usr/local/midas_apache/
			cp -r /home/mezzo/install_module_thirdparty/htdocs /usr/local/midas_apache/
			cp -r /home/mezzo/install_module_thirdparty/log_perl/*.pl /usr/local/midas_apache/logs
		fi

		read -p "Continue enter....install DSP client/server "
		
		if [ ! -e /usr/local/midas_apache/modules/mod_midas.so ];
		then
			read -p "Are you install midas Client/Server y/n? " yn
			if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
			then
				if [ ! -d /usr/local/midas2 ];
				then
					mkdir /usr/local/midas2
				fi
				if [ ! -d /usr/local/midas2/bin ];
				then
					mkdir /usr/local/midas2/bin
					mkdir /usr/local/midas2/logs
				 	cp -r /home/mezzo/Source_dsp/Client/clientctl /usr/local/midas2/bin
				fi
				if [ ! -d /usr/local/midas2/conf ];
				then 
					mkdir /usr/local/midas2/conf
					cp -r /home/mezzo/install_module_thirdparty/midas_conf/conf/* /usr/local/midas2/conf/
				fi

				# make client
				cd /home/mezzo/Source_dsp/Client
				make
				make install
				
				read -p "Continue enter....install DSP Server"
				# make mod_apache
				cd /home/mezzo/Source_dsp/mod_apache
				sed -i 's/\$ \/usr\//#\$ \/usr\//' Makefile
				make
				sed -i 's/#\$ \/usr\//\$ \/usr\//' Makefile
				echo "...........intall ending"
			fi
		fi
		;;
		"dsp_audience_apache")
		if ! [ -d /usr/local/audience_apache2 ];
		then
			echo "make audience_apache2 foler..."
			mkdir /usr/local/audience_apache2
			mkdir /usr/local/audience_apache2/log
		fi
		chown -R mezzo:mezzo /usr/local/audience_apache2


		yum remove apr.x86_64
		if [ ! -d /home/mezzo/install_module_thirdparty ];
		then
			echo "get 192.168.11.100:install_module_thirdparty ...."
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.100:/home/mezzo/apache2.4/install_module2 /home/mezzo/Install_Module
			mkdir /home/mezzo/Install_Module/audience
			chown -R mezzo:mezzo /home/mezzo/Install_Module/audience
		fi

		if [ ! -d /home/mezzo/Source ];
		then
			echo "get 192.168.11.100:source...."
			mkdir /home/mezzo/source
			chown -R mezzo:mezzo /home/mezzo/source
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.100:/home/mezzo/Source /home/mezzo/
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.100:/usr/local/audience/bin /home/mezzo/Install_Module/audience
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.100:/usr/local/audience/conf /home/mezzo/Install_Module/audience
			
			cp -r /home/mezzo/Install_Module/audience /usr/local/
			mkdir /usr/local/audience
			mkdir /usr/local/audience/bin
			mkdir /usr/local/audience/logs
			chown -R mezzo:mezzo /usr/local/audience
		fi

		read -p "Are you install HTTP Apache y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			read -p "Continue enter. make&install midas_moudle..."
			cd /home/mezzo/Install_Module/apr-1.5.2
			make clean
			./configure 
			make 
			make install
	
			echo "make apr..........................."
			cd /home/mezzo/Install_Module/apr-util-1.5.4
			make clean
			./configure --with-apr=/usr/local/apr
			make
			make install
	
			echo "make httpd..........................."
			cd /home/mezzo/Install_Module/httpd-2.4.18
			make clean
			./configure --prefix=/usr/local/audience_apache2 --enable-shared=max --enable-ssl --enable-module=ssl --enable-shared=sl --enable-module=so --enable-rule=SHARED_CORE --enable-module=setenvif --with-mpm=event
			make 
			make install

			echo "make cronlog....................."
			cd /home/mezzo/Install_Module/
			wget http://www.mirrorservice.org/sites/distfiles.macports.org/cronolog/cronolog-1.6.2.tar.gz
			tar xvfz cronolog-1.6.2.tar.gz
			cd cronolog-1.6.2
			./configure --prefix=/usr/local
			make 
			make install

			echo "make vnstat......."
			cd /home/mezzo/Install_Module/
			wget --no-check-certificate http://humdi.net/vnstat/vnstat-2.1.tar.gz
			tar xvfz vnstat-2.1.tar.gz
			cd vnstat-2.1
			./configure && make && make install

			echo "install json....."
			yum install json-c-devel.x86_64
			sed -i 's/#ServerName www.example.com:80/ServerName localhos/g' /usr/local/audience_apache2/conf/httpd.conf

			echo "make Client...."
			cd /home/mezzo/Source/Client
			make && make install

			echo "Make Apche...."
			cd /home/mezzo/Source/Apache
			make

		fi
		;;
		"audience_apache")
		yum remove apr.x86_64
		if [ ! -d /home/mezzo/install_module_thirdparty ];
		then
			echo "get 192.168.11.93:install_module_thirdparty ...."
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.93:/home/mezzo/Install_Module /home/mezzo/
			mkdir /home/mezzo/Install_Module/audience
			chown -R mezzo:mezzo /home/mezzo/Install_Module/audience
		fi

		if [ ! -d /home/mezzo/source ];
		then
			echo "get 192.168.11.93:source...."
			mkdir /home/mezzo/source
			chown -R mezzo:mezzo /home/mezzo/source
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.93:/home/mezzo/source/Apache /home/mezzo/source/Apache
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.93:/home/mezzo/source/Client /home/mezzo/source/Client
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.93:/usr/local/audience/bin /home/mezzo/Install_Module/audience
			sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.93:/usr/local/audience/conf /home/mezzo/Install_Module/audience
			
			cp -r /home/mezzo/Install_Module/audience /usr/local/
			mkdir /usr/local/audience/logs
			chown -R mezzo:mezzo /usr/local/audience
		fi

		read -p "Are you install HTTP Apache y/n? " yn
		if [ "$yn" = "y" ] || [ "$yn" = "Y" ];
		then
			read -p "Continue enter. make&install midas_moudle..."
			cd /home/mezzo/Install_Module/apr-1.5.2
			make clean
			./configure 
			make 
			make install
	
			echo "make apr..........................."
			cd /home/mezzo/Install_Module/apr-util-1.5.4
			make clean
			./configure --with-apr=/usr/local/apr
			make
			make install
	
			echo "make httpd..........................."
			cd /home/mezzo/Install_Module/httpd-2.4.18
			make clean
			./configure --prefix=/usr/local/audience_apache2 --enable-shared=max --enable-ssl --enable-module=ssl --enable-shared=sl --enable-module=so --enable-rule=SHARED_CORE --enable-module=setenvif --with-mpm=event
			make 
			make install

			echo "make cronlog....................."
			cd /home/mezzo/Install_Module/
			wget http://www.mirrorservice.org/sites/distfiles.macports.org/cronolog/cronolog-1.6.2.tar.gz
			tar xvfz cronolog-1.6.2.tar.gz
			cd cronolog-1.6.2
			./configure --prefix=/usr/local
			make 
			make install

			echo "make vnstat......."
			cd /home/mezzo/Install_Module/
			wget --no-check-certificate http://humdi.net/vnstat/vnstat-2.1.tar.gz
			tar xvfz vnstat-2.1.tar.gz
			cd vnstat-2.1
			./configure && make && make install

			echo "install json....."
			yum install json-c-devel.x86_64
			sed -i 's/#ServerName www.example.com:80/ServerName localhos/g' /usr/local/audience_apache2/conf/httpd.conf

			echo "make Client...."
			cd /home/mezzo/source/Client
			make && make install

			echo "Make Apche...."
			cd /home/mezzo/source/Apache
			make
		fi
		;;
		"apache_proxy")
		sudo -u mezzo mkdir /home/mezzo/tmp
		sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/tmp/apache_proxy /home/mezzo/tmp
		cp -r /home/mezzo/tmp/apache_proxy /usr/local
		ls -al /usr/local/apache_proxy
		cp /usr/lib64/libexpat.so.1 /usr/lib64/libexpat.so.0
		cp /usr/lib64/libpcre.so.1 /usr/lib64/libpcre.so.0
		;;
		"man_proxy_conf")
		sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/man_2.0 /home/mezzo
		chown -R mezzo:mezzo /home/mezzo/man_2.0
		ls -al /home/mezzo
		;;
		"dsp_proxy_conf")
		sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/dsp_2.0 /home/mezzo
	 	/usr/bin/cp -f /home/mezzo/dsp_2.0/httpd.conf /usr/local/apache_proxy/conf/httpd.conf
		/usr/bin/cp -f /home/mezzo/dsp_2.0/httpd-ssl.conf /usr/local/apache_proxy/conf/extra/httpd-ssl.conf
		/usr/bin/cp -f /home/mezzo/dsp_2.0/httpd-default.conf /usr/local/apache_proxy/conf/extra/httpd-default.conf
		/usr/bin/cp -f /home/mezzo/dsp_2.0/httpd-mpm.conf /usr/local/apache_proxy/conf/extra/httpd-mpm.conf
		sudo -u mezzo cp -r /home/mezzo/ssp_2.0/ssl /home/mezzo

		chown -R mezzo:mezzo /home/mezzo/dsp_2.0
		ls -al /home/mezzo
		;;
		"ssp_proxy_conf")
		sudo -u mezzo scp -P 7722 -qr mezzo@14.34.11.165:/home/mezzo/ssp_2.0 /home/mezzo
		/usr/bin/cp -f /home/mezzo/ssp_2.0/httpd.conf /usr/local/apache_proxy/conf/httpd.conf
		/usr/bin/cp -f /home/mezzo/ssp_2.0/httpd-ssl.conf /usr/local/apache_proxy/conf/extra/httpd-ssl.conf
		/usr/bin/cp -f /home/mezzo/ssp_2.0/httpd-default.conf /usr/local/apache_proxy/conf/extra/httpd-default.conf
		/usr/bin/cp -f /home/mezzo/ssp_2.0/httpd-mpm.conf /usr/local/apache_proxy/conf/extra/httpd-mpm.conf
		sudo -u mezzo cp -r /home/mezzo/ssp_2.0/ssl /home/mezzo
		chown -R mezzo:mezzo /home/mezzo/ssp_2.0

		
		echo "make cronlog....................."
		rm -rf /home/mezzo/tmp/cronolog-1.6.2
		cd /home/mezzo/tmp/
		wget http://www.mirrorservice.org/sites/distfiles.macports.org/cronolog/cronolog-1.6.2.tar.gz
		tar xvfz cronolog-1.6.2.tar.gz
		cd cronolog-1.6.2
		./configure --prefix=/usr/local
		make 
		make install

		yum remove apr.x86_64
 		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/home/mezzo/install_module2/apr-1.5.2 /home/mezzo/tmp
		sudo -u mezzo scp -P 7722 -qr mezzo@192.168.11.25:/home/mezzo/install_module2/apr-util-1.5.4 /home/mezzo/tmp
		
		echo "make apr........................."
		cd /home/mezzo/tmp/apr-1.5.2
		make clean
		./configure 
		make 
		make install
	
		echo "make apr-util...................."
		cd /home/mezzo/tmp/apr-util-1.5.4
		make clean
		./configure --with-apr=/usr/local/apr
		make
		make install

		ls -al /home/mezzo
		;;

		"quit"|*)
		echo "quit......";
		break;
		;;
	esac
done


