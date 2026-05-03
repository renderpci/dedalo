<?php declare(strict_types=1);
/**
 * FILE_UPLOAD_NORMALIZER
 * Converts PSR-7 uploaded files into PHP-like $_FILES array format.
 *
 * Recursively normalizes UploadedFileInterface objects, preserving
 * the original PSR-7 object for moveTo() support via the 'psr7' key.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

use Psr\Http\Message\UploadedFileInterface;

final class file_upload_normalizer {

	/**
	 * NORMALIZE
	 * Converts PSR-7 uploaded files tree to PHP $_FILES format.
	 *
	 * @param array $uploadedFiles From $request->getUploadedFiles()
	 * @return array PHP-like $_FILES array
	 */
	public function normalize(array $uploadedFiles) : array {

		return $this->normalizeRecursive($uploadedFiles);
	}

	/**
	 * Recursively normalizes uploaded files.
	 *
	 * @param array $files
	 * @return array
	 */
	private function normalizeRecursive(array $files) : array {

		$normalized = [];
		foreach ($files as $key => $value) {
			if ($value instanceof UploadedFileInterface) {
				$tmp_name = '';
				try {
					$stream   = $value->getStream();
					$tmp_name = $stream->getMetadata('uri') ?? '';
				} catch (\Throwable $e) {
					// Stream may already be detached; leave tmp_name empty
				}

				$normalized[$key] = [
					'name'     => $value->getClientFilename(),
					'type'     => $value->getClientMediaType(),
					'tmp_name' => $tmp_name,
					'error'    => $value->getError(),
					'size'     => $value->getSize(),
					'psr7'     => $value, // Preserve for moveTo() support
				];
			} elseif (is_array($value)) {
				$normalized[$key] = $this->normalizeRecursive($value);
			}
		}

		return $normalized;
	}
}
