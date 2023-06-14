FROM php:8.1-cli

RUN apt-get update && \
    apt-get install -y git graphviz libicu-dev libzip-dev make nano net-tools raptor2-utils wget zip zlib1g-dev

RUN apt-get install -y openjdk-11-jre

RUN docker-php-ext-install intl zip && docker-php-ext-enable intl zip

# install composer globally
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# add custom PHP.ini settings
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
COPY ./custom.ini /usr/local/etc/php/conf.d/custom.ini

RUN rm -rf /var/www/html/*
WORKDIR /var/www/html/

# adds user "easyrdf", adds him to group "www-data" and sets his home folder
# for more background information see:
# https://medium.com/@mccode/understanding-how-uid-and-gid-work-in-docker-containers-c37a01d01cf
RUN useradd -r --home /home/easyrdf -u 1000 easyrdf
RUN usermod -a -G www-data easyrdf
RUN mkdir /home/easyrdf
RUN chown easyrdf:www-data /home/easyrdf

CMD ["tail -f /dev/null"]
