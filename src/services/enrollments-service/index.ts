import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { invalidDataError, notFoundError } from '@/errors';
import addressRepository, { CreateAddressParams } from '@/repositories/address-repository';
import enrollmentRepository, { CreateEnrollmentParams } from '@/repositories/enrollment-repository';
import { exclude } from '@/utils/prisma-utils';
import { cepInvalidError } from '@/errors/cep-invalid-error';

async function getAddressFromCEP(cep: string) {
  const formattedCEP = cep.replace('-', '');

  if (formattedCEP.length !== 8) throw cepInvalidError();

  const result = await request.get(`${process.env.VIA_CEP_API}/${cep}/json/`);

  console.log('Result: ', result.data);

  if (result.data.erro) throw invalidDataError(['invalid CEP']);

  if (!result.data) {
    throw notFoundError();
  }

  Object.entries(result.data).forEach((entries) => {
    const keys = ['logradouro', 'complemento', 'bairro', 'cidade', 'uf'];
    const [key, value] = entries;

    if (keys.includes(key) && !value) throw cepInvalidError();
  });

  const { bairro, localidade, complemento, logradouro, uf } = result.data;
  const filteredData = { logradouro, complemento, bairro, cidade: localidade, uf };

  return filteredData;
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  const address = getAddressForUpsert(params.address);

  try {
    await getAddressFromCEP(address.cep);
  } catch {
    throw invalidDataError(['invalid CEP']);
  }

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};

export default enrollmentsService;
