if [ "$1" == "" ];
then
	echo "Input....Server IP or Server Name(/etc/hosts)"
	exit;
fi

echo "Deploy..... To $1"
scp -P 7722 -qr /home/mezzo/.ssh mezzo@$1:/home/mezzo
scp -P 7722 /home/mezzo/sysskel/sysskel.sh mezzo@$1:/home/mezzo

echo "Endiing... Deploy"
ssh -p 7722 mezzo@$1
