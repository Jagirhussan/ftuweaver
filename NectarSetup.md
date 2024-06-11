Create a http security group that allows connections to desired ports
This would be under the TCP option (the standard http option is for port 80)
8080, 8082
Also create a security group for ssh

Use CIDR, with 0.0.0.0/0 as the IP

Add this to the default, and ssh groups - at the time of creating the instance

For ubuntu image, the default user name is ubuntu
This can be accessed with the keypair that is loaded to nectar

In the server instance that is running in nectar
start the firewall and open up the ports, dont forget to open port 22 or ssh connections cannot be made

sudo ufw enable
sudo ufw allow from any to any port 20,21,22,80 proto tcp
sudo ufw status

Install node 

wget https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh
bash install.sh

source ~/.bashrc
#LTS release
nvm install v18.16.0

Then go into the directory and do npm install
Allow node to use port 80

sudo apt-get install libcap2-bin
sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``

install screen if it is not already present
sudo apt install screen

Start a screen 
then run npm run dev

# Handling esbuild issues
Error that looks something like below
"If you are installing esbuild with npm, make sure that you don't specify the
 "--no-optional" flag. The "optionalDependencies" package.json feature is used
 by esbuild to install the correct binary executable for your current platform."

Delete package-lock.json
Run
npm install
npm rebuild esbuild

and restart
