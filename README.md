Mighty Miner
===========================
Bitcoin Mining software that drives the Antminer S1 hashing boards directly via UART

Detailed Description
-------------------------
Detailed description of the BM1380 Hashing IC operation: http://mightydevices.com/?p=615

Modules
-------------------------

Software consists of:
* Stratum Client (getting data needed to generate mining jobs, submitting mining results)
* Mining Job Generator (generates mining jobs from the information provided by Stratum Client
* BM1380 Miner (communication with mining chips, scheduling work, feching the results)
* Mining Results Validator (checking if mining results meet the difficuly of the mining pool)

All modules are written using bi-directional streams (Stream.Duplex).

Configuration
-------------------------
Make sure that you enter proper stratum pool credentials and miners serial port name in the index.js

Donations (BTC)
-------------------------
152dEicovRXbxBgTmoY3izd7ThrxRNdPqW
