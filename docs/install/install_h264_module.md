# Apache module to cut audiovisual files in real time

This module add the feature to Apache http server to cut audiovisual fragments by specific time.
It use the MPEG-4 Part 12, ISO/IEC 14496-12:2022 definition to find the in and out position and server the fragment as new audiovisual file.

## To install

### Ubuntu/Debian

1. Copy *mod_dedalo_h264_streaming.so* to modules:

    ```shell
    cp mod_dedalo_h264_streaming.so /usr/lib/apache2/modules/
    ```

2. Copy *dedalo_h264.load* to apache2 config

    ```shell
    cp dedalo_h264.load /etc/apache2/mods-available/
    ```

3. Activate it

    ```shell
        a2enmod dedalo_h264
    ```

4. reload Apache

    ```shell
        systemctl restart apache2
    ```

### Rocky/RedHat/Fedora

1. Copy *mod_dedalo_h264_streaming.so* to modules:

    ```shell
    cp mod_dedalo_h264_streaming.so /usr/lib64/httpd/modules/
    ```

2. Copy *00-dedaloh264.conf* to httpd config

    ```shell
    cp dedalo_h264.load /etc/httpd/conf.modules.d
    ```

3. Activate it

    ```shell
    systemctl restart httpd
    ```

## To compile

1. Install dependencies

    *Ubuntu/Debian*

    ```shell
    apt install apache2-devel
    ```

    *Rocky/RedHat/Fedora*

    ```shell
    dnf groupinstall "Development Tools"
    dnf install httpd-devel
    ```

2. Compile and install

    ```shell
    cd ~/mod_h264_streaming-3.0.0
    ./configure
    make
    sudo make install
    ```

!!! Note
    OSX: Apple removed the `apxs` support in 10.13+ and it's necessary to compile it with the brew or other as:

    ```shell
    ./configure --with-apxs='/opt/homebrew/Cellar/httpd/2.4.57_1/bin/apxs'
    make
    sudo make install
    ```
