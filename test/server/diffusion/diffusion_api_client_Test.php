<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* DIFFUSION_API_CLIENT_TEST
* Endpoint URL resolution for the server-to-server diffusion client.
*
* DEDALO_DIFFUSION_API_URL is configured browser-relative (e.g.
* "/v7/diffusion/api/v1/") because it is also published to JS clients, where
* the browser supplies the origin. Server-side curl, however, rejects a
* host-less URL ("URL rejected: No host part in the URL"). The client must
* therefore promote a relative endpoint URL to an absolute one before curl.
*/
final class diffusion_api_client_Test extends BaseTestCase {

	public static $model = 'diffusion_api_client';



	/**
	* TEST_RELATIVE_URL_IS_MADE_ABSOLUTE
	* A browser-relative endpoint URL is promoted to scheme + host so curl accepts it.
	*/
	public function test_relative_url_is_made_absolute(): void {

		$absolute = diffusion_api_client::to_absolute_url('/v7/diffusion/api/v1/');

		$this->assertStringContainsString('://', $absolute, 'Resolved URL has no scheme (curl would reject it)');
		$this->assertStringStartsWith(DEDALO_PROTOCOL, $absolute);
		$this->assertStringContainsString(DEDALO_HOST, $absolute);
		$this->assertStringEndsWith('/v7/diffusion/api/v1/', $absolute, 'Original path must be preserved');
	}//end test_relative_url_is_made_absolute



	/**
	* TEST_ABSOLUTE_URL_IS_UNCHANGED
	* An already-absolute URL (remote Bun install) is passed through untouched.
	*/
	public function test_absolute_url_is_unchanged(): void {

		$url = 'https://engine.example.org:8443/diffusion/api/v1/';

		$this->assertSame($url, diffusion_api_client::to_absolute_url($url));
	}//end test_absolute_url_is_unchanged



	/**
	* TEST_EMPTY_URL_IS_UNCHANGED
	* An empty URL is left empty (caller reports the missing-endpoint error).
	*/
	public function test_empty_url_is_unchanged(): void {

		$this->assertSame('', diffusion_api_client::to_absolute_url(''));
	}//end test_empty_url_is_unchanged



}//end class diffusion_api_client_Test
