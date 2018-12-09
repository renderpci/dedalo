<?php

    $spBaseUrl = 'http://benimamet.no-ip.org:8080/dedalo/vendor/onelogin/php-saml'; //or http://<your_domain>

    $settingsInfo = array (
        'sp' => array (
            'entityId' => $spBaseUrl.'/demo1/metadata.php',
            'assertionConsumerService' => array (
                'url' => $spBaseUrl.'/demo1/index.php?acs',
            ),
            'singleLogoutService' => array (
                'url' => $spBaseUrl.'/demo1/index.php?sls',
            ),
            'NameIDFormat' => 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
        ),
        'idp' => array (
            'entityId' => 'https://preproduccio.idp1-gicar.gencat.cat/idp/profile/SAML2/Redirect/SSO',
            'singleSignOnService' => array (
                'url' => 'https://preproduccio.idp1-gicar.gencat.cat/idp/profile/SAML2/Redirect/SSO',
            ),
            'singleLogoutService' => array (
                'url' => 'https://preproduccio.idp1-gicar.gencat.cat/idp/profile/SAML2/Redirect/SSO',
            ),
            'x509cert' => '',
        ),
    );
