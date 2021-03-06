#!/usr/local/bin/node

var request = require('request');
var requestp = require('request-promise');
var json2csv = require('json2csv');
var fs = require('fs');
var async = require('async');
var select = require('xpath.js')
      , dom = require('xmldom').DOMParser
var httpAdapter = 'http';

var path = process.argv[4];
var now = new Date();
var orgId = '';
var options = {
    url: '',
    headers: {
        'Accept':'application/json'
    },
    auth: {
        'user': process.argv[2],
        'pass': process.argv[3]
    }
};

var optionsp = {
    uri: 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/infrastructure/datacenter',
    headers: {
        'Accept':'application/json'
    },
    auth: {
        'user': process.argv[2],
        'pass': process.argv[3]
    },
    json: true
};

var optionsMyAccount = {
    url: 'https://api-na.dimensiondata.com/oec/0.9/myaccount',
    headers: {
        'Accept':'application/xml'
    },
    auth: {   
        'user': process.argv[2],
        'pass': process.argv[3]
    }
};

var fields_Location = ['displayName', 'id', 'type', 'city', 'state', 'country', 'latitude', 'longitude' ];
var fields_NetworkDomains = ['name', 'type', 'id', 'datacenterId'];
var fields_Vlans = ['networkDomain.id', 'networkDomain.name', 'name', 'id', 'datacenterId'];
var fields_PublicIps = ['networkDomainId', 'baseIp', 'size', 'id', 'datacenterId'];
var fields_Server = ['name', 'description', 'timestamp', 'operatingSystem.id', 'operatingSystem.displayName', 'cpuCount', 'memoryGb', 'disk.sizeGb', 'disk.speed', 'networkInfo.primaryNic.id','networkInfo.primaryNic.vlanId', 'networkInfo.primaryNic.privateIpv4', 'networkInfo.networkDomainId','sourceImageId','id', 'datacenterId'];
var fields_FirewallRule = ['networkDomainId', 'name', 'action', 'protocol', 'source.ip.address', 'destination.ip.address', 'destination.port.begin', 'enabled', 'id', 'datacenterId', 'ruleType'];
var fields_NatRule = ['networkDomainId', 'internalIp', 'externalIp', 'id', 'datacenterId', 'baseIp'];

var publicIps = [];

function callToNAT(networkdomains) {
    var natRule = [];
    async.forEach(networkdomains, function (item, callback) {
        optionsp.uri = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/network/natRule';
        //console.log('Network Domain: ', item.id);
        optionsp.uri = optionsp.uri + '?networkDomainId=' + item.id;
        requestp(optionsp).then(function (body) {
            //console.log(body);
            if (typeof natRule[0] === 'undefined') {
                natRule = body.natRule.slice();
                //console.log('New IP: ',publicIps);
            } else {
                if (body.natRule) {
                    natRule = natRule.concat(body.natRule);
                    //console.log('IP: ',publicIps);
                }
            }
            callback();
        }).catch(function (err) {
            console.log(err);
            callback();
        });

    }, function (err) {
        //console.log(JSON.stringify(publicIps));
        var tmp = natRule.slice();
        for (var i = 0, nat = natRule.length; i < nat; i++) {
            for (var j = 0, ip = publicIps.length; j < ip; j++) {
                if (publicIps[j].baseIp.substring(0, publicIps[j].baseIp.lastIndexOf('.')) === natRule[i].externalIp.substring(0, natRule[i].externalIp.lastIndexOf('.'))
                    && parseInt(publicIps[j].baseIp.substring(publicIps[j].baseIp.lastIndexOf('.') + 1)) + 1 === parseInt(natRule[i].externalIp.substring(natRule[i].externalIp.lastIndexOf('.') + 1))
                    && publicIps[j].datacenterId === natRule[i].datacenterId
                    && publicIps[j].networkDomainId === natRule[i].networkDomainId) {
                    tmp[i].baseIp = publicIps[j].baseIp;
                    break;
                } else {
                    tmp[i].baseIp = 'NULL';
                }
            }
        }

        for (var i = 0, nat = natRule.length; i < nat; i++) {
            for (var j = 0, ip = publicIps.length; j < ip; j++) {
                if(publicIps[j].baseIp === natRule[i].externalIp
                    && publicIps[j].datacenterId === natRule[i].datacenterId
                    && publicIps[j].networkDomainId === natRule[i].networkDomainId) {
                    if( tmp[i].baseIp === 'NULL') {
                        tmp[i].baseIp = publicIps[j].baseIp;
                    }
                    break;
                }
            }
        }

        natRule = tmp.slice();
        //console.log(JSON.stringify(natRule));
        json2csv({data: natRule, fields: fields_NatRule, quotes: '', defaultValue: 'NULL'}, function (err, csv) {
            if (err) console.log(err);
            fs.writeFile(path+'/natrule.csv', csv, function (err) {
                if (err) throw err;
                console.log('Natrule CSV created');
            });
        });
    });
}


function callToPublicIps(networkdomains){
    async.forEach(networkdomains, function(item, callback){
        optionsp.uri = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/network/publicIpBlock';
        //console.log('Network Domain: ',item.id);
        optionsp.uri = optionsp.uri + '?networkDomainId=' + item.id;
        requestp(optionsp).then(function(body) {
            //console.log(body);
                if(typeof publicIps[0] === 'undefined'){
                    publicIps = body.publicIpBlock.slice();
                    //console.log('New IP: ',publicIps);
                }else {
                    if(body.publicIpBlock) {
                        publicIps = publicIps.concat(body.publicIpBlock);
                        //console.log('IP: ',publicIps);
                    }
                }
                callback();
        }).catch(function(err){
                console.log(err);
                callback();
        });

    }, function(err){
        //console.log(JSON.stringify(publicIps));
        json2csv({ data: publicIps, fields: fields_PublicIps, quotes:'' , defaultValue:'NULL'}, function(err, csv) {
            if (err) console.log(err);
            fs.writeFile(path+'/publicips.csv', csv, function(err) {
                if (err) throw err;
                console.log('PublicIPs CSV created');
            });
        });
    });

}

function callToFirewallRules(networkdomains){
    var firewallRule = [];
    async.forEach(networkdomains, function(item, callback){
        optionsp.uri = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/network/firewallRule';
        //console.log('Network Domain: ',item.id);
        optionsp.uri = optionsp.uri + '?networkDomainId=' + item.id;
        requestp(optionsp).then(function(body) {
            //console.log(body);
            if(typeof firewallRule[0] === 'undefined'){
                firewallRule = body.firewallRule.slice();
               // console.log('New FirewallRule: ',firewallRule);
            }else {
                if(body.firewallRule) {
                    firewallRule = firewallRule.concat(body.firewallRule);
                    //console.log('Firewall Rule: ',firewallRule);
                }
            }
            callback();
        }).catch(function(err){
            console.log(err);
            callback();
        });

    }, function(err){
        //console.log(JSON.stringify(firewallRule));
        json2csv({ data: firewallRule, fields: fields_FirewallRule, quotes:'' , defaultValue:'NULL'}, function(err, csv) {
            if (err) console.log(err);
            fs.writeFile(path+'/firewallrule.csv', csv, function(err) {
                if (err) throw err;
                console.log('Firewallrule CSV created');
            });
        });
    });

}


function getServers(error, response, body) {
    if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        for (var i = 0; i < info.server.length; i++) { 
 			info.server[i]['timestamp'] = now;
		}
        json2csv({ data: info.server, fields: fields_Server, quotes:'', defaultValue:'NULL' }, function(err, csv) {
            if (err) console.log(err);
            fs.writeFile(path+'/servers.csv', csv, function(err) {
                if (err) throw err;
                console.log('Servers CSV created');
            });
        });

    }else{
        console.log(JSON.parse(body));
    }
}

function getVlans(error, response, body) {
    if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        json2csv({ data: info.vlan, fields: fields_Vlans, quotes:'' , defaultValue:'NULL'}, function(err, csv) {
            if (err) console.log(err);
            fs.writeFile(path+'/vlans.csv', csv, function(err) {
                if (err) throw err;
                console.log('Vlans file created');
            });
        });
        //Get Servers
        options.url = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/server/server';
        request(options, getServers);

    }else{
        console.log(error);
    }
}

function getNetworkDomains(error, response, body) {
    if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
         json2csv({ data: info.networkDomain, fields: fields_NetworkDomains, quotes:'' , defaultValue:'NULL'}, function(err, csv) {
            if (err) console.log(err);
                fs.writeFile(path+'/networkdomain.csv', csv, function(err) {
            if (err) throw err;
                console.log('NetworkDomain CSV created');
            });
         });
        //Get Public IPS
        callToPublicIps(info.networkDomain);

        //Get Firewall Rules
        callToFirewallRules(info.networkDomain);

        //Get NAT Rules
        callToNAT(info.networkDomain);

        //Get VLANS
        options.url = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/network/vlan';
        request(options, getVlans);

    }else{
        console.log(error);
    }
}

function getLocations(error, response, body) {
    if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        var tmp = [];
        tmp = info.datacenter.slice();
        json2csv({ data: info.datacenter, fields: fields_Location, quotes:'' , defaultValue:'NULL'}, function(err, csv) {
                if (err) console.log(err);
                fs.writeFile(path+'/locations.csv', csv, function(err) {
                    if (err) throw err;
                    console.log('Locations CSV created');
                });
        });

        //Get Network Domains
        options.url = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/network/networkDomain';
        request(options, getNetworkDomains);

    }else{
        console.log(response);
    }
}

//  My Account API processing
function getMyAccount(error, response, body) {
	if (!error && response.statusCode == 200) {
	    console.log('Received valid response from My Account API...');
    	var doc = new dom().parseFromString(body);
    	orgId = select(doc, "//*[local-name()='orgId']/text()")[0].data
    	console.log('Your Organization ID: '+orgId);
    	//Invoke Locations API
    	options.url = 'https://api-na.dimensiondata.com/caas/2.0/'+orgId+'/infrastructure/datacenter';
		request(options, getLocations);
	}else{
   		console.log('Received invalid response or error from My Account API...');
        console.log(JSON.parse(body));
    }

}
//Get Locations
request(optionsMyAccount, getMyAccount);
